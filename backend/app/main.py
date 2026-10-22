"""LocalShop API: hyperlocal marketplace connecting shopkeepers and nearby customers."""
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .auth import create_token, current_user, hash_password, require_role, verify_password
from .db import engine, get_db
from .geo import bounding_box, haversine_km
from .onboarding import router as onboarding_router
from .models import (
    Base, CustomerShopLink, InventoryLog, Order, OrderItem, OrderReview, OrderStatus,
    Product, ProductReview, Role, Shop, User,
)

LOW_STOCK_THRESHOLD = 5
ACTIVE_STATUSES = [OrderStatus.placed, OrderStatus.confirmed, OrderStatus.packed, OrderStatus.ready]

# Order lifecycle. Anything not listed here is rejected with 409.
TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.placed: {OrderStatus.confirmed, OrderStatus.cancelled},
    OrderStatus.confirmed: {OrderStatus.packed, OrderStatus.cancelled},
    OrderStatus.packed: {OrderStatus.ready, OrderStatus.cancelled},
    OrderStatus.ready: {OrderStatus.completed},
}

# Development creates tables automatically. UAT and production must use migrations.
if not settings.is_production_like:
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="LocalShop API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(onboarding_router)


# ---------- Schemas ----------

class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=r"^\+?\d{10,15}$")
    password: str = Field(min_length=8)
    role: Role


class LoginIn(BaseModel):
    phone: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    role: Role
    user_id: int


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ShopIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    address: str = Field(min_length=5)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    delivery_radius_km: float = Field(default=3.0, gt=0, le=20)


class ShopUpdate(BaseModel):
    is_open: Optional[bool] = None
    delivery_radius_km: Optional[float] = Field(default=None, gt=0, le=20)
    members_only: Optional[bool] = None


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=60)
    unit: str = Field(min_length=1, max_length=30)
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    stock: int = Field(ge=0)
    discount_percent: int = Field(default=0, ge=0, le=90)


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    price: Optional[Decimal] = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    discount_percent: Optional[int] = Field(default=None, ge=0, le=90)
    is_active: Optional[bool] = None


class RestockIn(BaseModel):
    quantity: int = Field(ge=-10000, le=10000)  # negative values are stock corrections
    reason: str = Field(default="restock", max_length=60)


class JoinShopIn(BaseModel):
    invite_code: str = Field(min_length=4, max_length=12)


class BindCustomerIn(BaseModel):
    exclusive: bool


class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=100)
    expected_price: Optional[Decimal] = None  # price the customer saw; guards against stale prices


class PlaceOrderIn(BaseModel):
    shop_id: int
    items: list[OrderItemIn] = Field(min_length=1)
    fulfilment: str = Field(pattern="^(pickup|delivery)$")
    delivery_address: Optional[str] = Field(default=None, max_length=500)
    delivery_lat: Optional[float] = None
    delivery_lng: Optional[float] = None
    idempotency_key: Optional[str] = Field(default=None, max_length=64)

    @field_validator("items")
    @classmethod
    def unique_products(cls, items):
        ids = [i.product_id for i in items]
        if len(ids) != len(set(ids)):
            raise ValueError("Each product may appear only once per order")
        return items


class StatusIn(BaseModel):
    status: OrderStatus


class ProductStars(BaseModel):
    order_item_id: int
    stars: int = Field(ge=1, le=5)


class ReviewIn(BaseModel):
    shop_stars: int = Field(ge=1, le=5)
    delivery_stars: Optional[int] = Field(default=None, ge=1, le=5)
    product_reviews: list[ProductStars] = []


# ---------- Helpers ----------

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def effective_price(p: Product) -> Decimal:
    return (Decimal(p.price) * (100 - p.discount_percent) / 100).quantize(Decimal("0.01"))


def bump_average(avg: float, count: int, stars: int) -> tuple[float, int]:
    new_count = count + 1
    return ((avg * count) + stars) / new_count, new_count


def shop_owned_by(user: User, db: Session) -> Shop:
    shop = db.query(Shop).filter_by(owner_id=user.id).first()
    if shop is None:
        raise HTTPException(404, "Create your shop first")
    return shop


def product_out(p: Product) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "category": p.category,
        "unit": p.unit,
        "list_price": str(p.price),
        "price": str(effective_price(p)),
        "discount_percent": p.discount_percent,
        "stock": p.stock,
        "is_active": p.is_active,
        "in_stock": p.is_active and p.stock > 0,
        "rating_avg": round(p.rating_avg, 2),
        "rating_count": p.rating_count,
    }


def shop_public(s: Shop) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "address": s.address,
        "lat": s.lat,
        "lng": s.lng,
        "delivery_radius_km": s.delivery_radius_km,
        "is_open": s.is_open,
        "verification_status": s.verification_status,
        "members_only": s.members_only,
        "shop_rating": round(s.shop_rating_avg, 2),
        "shop_rating_count": s.shop_rating_count,
        "delivery_rating": round(s.delivery_rating_avg, 2),
        "delivery_rating_count": s.delivery_rating_count,
    }


def order_out(o: Order) -> dict:
    return {
        "id": o.id,
        "shop_id": o.shop_id,
        "status": o.status.value,
        "fulfilment": o.fulfilment,
        "delivery_address": o.delivery_address,
        "total": str(o.total),
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "reviewed": o.review is not None,
        "items": [
            {
                "id": i.id,
                "product_id": i.product_id,
                "name": i.product_name,
                "unit_price": str(i.unit_price),
                "quantity": i.quantity,
            }
            for i in o.items
        ],
    }


def membership(db: Session, customer_id: int, shop_id: int) -> Optional[CustomerShopLink]:
    return db.query(CustomerShopLink).filter_by(customer_id=customer_id, shop_id=shop_id).first()


# ---------- Auth ----------

@app.post("/auth/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if body.role == Role.admin:
        raise HTTPException(403, "Admin accounts are created by the platform team")
    if db.query(User).filter_by(phone=body.phone).first():
        raise HTTPException(409, "Phone number already registered")
    user = User(
        name=body.name,
        phone=body.phone,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_token(user), role=user.role, user_id=user.id)


@app.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(phone=body.phone).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong phone or password")
    return TokenOut(access_token=create_token(user), role=user.role, user_id=user.id)


# ---------- Customer: location and discovery ----------

@app.put("/me/location", status_code=204)
def update_location(
    body: LocationIn,
    user: User = Depends(require_role(Role.customer, Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    user.last_lat, user.last_lng = body.lat, body.lng
    db.commit()


@app.get("/shops/nearby")
def nearby_shops(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(5, gt=0, le=25),
    user: User = Depends(require_role(Role.customer)),
    db: Session = Depends(get_db),
):
    min_lat, max_lat, min_lng, max_lng = bounding_box(lat, lng, radius_km)
    candidates = (
        db.query(Shop)
        .filter(
            Shop.is_open.is_(True),
            Shop.verification_status == "verified",
            Shop.lat.between(min_lat, max_lat),
            Shop.lng.between(min_lng, max_lng),
        )
        .all()
    )
    linked_ids = {l.shop_id for l in db.query(CustomerShopLink).filter_by(customer_id=user.id)}
    results = []
    for s in candidates:
        distance = haversine_km(lat, lng, s.lat, s.lng)
        if distance > radius_km:
            continue
        is_member = s.id in linked_ids
        if s.members_only and not is_member:
            continue  # members-only shops are hidden from non-members
        results.append({
            **shop_public(s),
            "distance_km": round(distance, 2),
            "delivers_to_you": distance <= s.delivery_radius_km,
            "is_member": is_member,
        })
    return sorted(results, key=lambda r: r["distance_km"])


@app.get("/shops/{shop_id}")
def shop_detail(
    shop_id: int,
    user: User = Depends(require_role(Role.customer)),
    db: Session = Depends(get_db),
):
    shop = db.get(Shop, shop_id)
    if shop is None or shop.verification_status != "verified":
        raise HTTPException(404, "Shop not found")
    if shop.members_only and membership(db, user.id, shop.id) is None:
        raise HTTPException(403, "This shop only serves its members")
    products = (
        db.query(Product)
        .filter_by(shop_id=shop.id, is_active=True)
        .order_by(Product.category, Product.name)
        .all()
    )
    grouped: dict[str, list[dict]] = {}
    for p in products:
        grouped.setdefault(p.category, []).append(product_out(p))
    return {
        "shop": shop_public(shop),
        "categories": [{"name": name, "products": items} for name, items in grouped.items()],
    }


@app.post("/shops/join")
def join_shop(
    body: JoinShopIn,
    user: User = Depends(require_role(Role.customer)),
    db: Session = Depends(get_db),
):
    shop = db.query(Shop).filter_by(invite_code=body.invite_code.strip().upper()).first()
    if shop is None or shop.verification_status != "verified":
        raise HTTPException(404, "Invalid invite code")
    if membership(db, user.id, shop.id) is None:
        db.add(CustomerShopLink(customer_id=user.id, shop_id=shop.id))
        db.commit()
    return {"shop_id": shop.id, "name": shop.name}


# ---------- Orders (customer) ----------

@app.post("/orders", status_code=201)
def place_order(
    body: PlaceOrderIn,
    user: User = Depends(require_role(Role.customer)),
    db: Session = Depends(get_db),
):
    # 1. Idempotency: a retried request (flaky network) returns the original order.
    if body.idempotency_key:
        existing = db.query(Order).filter_by(
            customer_id=user.id, idempotency_key=body.idempotency_key
        ).first()
        if existing:
            return order_out(existing)

    # 2. Shop and access rules
    shop = db.get(Shop, body.shop_id)
    if shop is None or not shop.is_open or shop.verification_status != "verified":
        raise HTTPException(409, "Shop is closed, unverified or does not exist")

    link = membership(db, user.id, shop.id)
    if shop.members_only and link is None:
        raise HTTPException(403, "This shop only serves its members")
    bound_elsewhere = (
        db.query(CustomerShopLink)
        .filter(
            CustomerShopLink.customer_id == user.id,
            CustomerShopLink.exclusive.is_(True),
            CustomerShopLink.shop_id != shop.id,
        )
        .first()
    )
    if bound_elsewhere is not None:
        raise HTTPException(403, "You are bound to another shop and can only order there")

    # 3. Delivery range check, using the coordinates captured at checkout
    if body.fulfilment == "delivery":
        if body.delivery_lat is None or body.delivery_lng is None or not body.delivery_address:
            raise HTTPException(422, "Delivery needs an address and live coordinates")
        distance = haversine_km(shop.lat, shop.lng, body.delivery_lat, body.delivery_lng)
        if distance > shop.delivery_radius_km:
            raise HTTPException(
                422,
                f"Outside delivery range ({distance:.1f} km away, shop delivers within "
                f"{shop.delivery_radius_km} km)",
            )

    # 4. Lock the product rows so two customers cannot oversell the last unit
    product_ids = [i.product_id for i in body.items]
    products = {
        p.id: p
        for p in db.query(Product)
        .filter(Product.shop_id == shop.id, Product.id.in_(product_ids), Product.is_active.is_(True))
        .with_for_update()
        .all()
    }

    total = Decimal("0.00")
    order_items: list[OrderItem] = []
    for item in body.items:
        p = products.get(item.product_id)
        if p is None:
            raise HTTPException(409, f"Product {item.product_id} is no longer available")
        unit = effective_price(p)
        if item.expected_price is not None and unit != item.expected_price.quantize(Decimal("0.01")):
            raise HTTPException(409, f"Price of {p.name} changed to {unit}. Please review your cart.")
        if p.stock < item.quantity:
            raise HTTPException(409, f"Only {p.stock} x {p.name} left in stock")

        p.stock -= item.quantity
        total += unit * item.quantity
        order_items.append(OrderItem(
            product_id=p.id,
            product_name=p.name,
            category=p.category,
            unit_price=unit,
            quantity=item.quantity,
        ))
        db.add(InventoryLog(product_id=p.id, change=-item.quantity, reason="order_placed"))

    order = Order(
        customer_id=user.id,
        shop_id=shop.id,
        status=OrderStatus.placed,
        fulfilment=body.fulfilment,
        delivery_address=body.delivery_address if body.fulfilment == "delivery" else None,
        total=total,
        idempotency_key=body.idempotency_key,
        items=order_items,
    )
    db.add(order)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if body.idempotency_key:
            dup = db.query(Order).filter_by(
                customer_id=user.id, idempotency_key=body.idempotency_key
            ).first()
            if dup:
                return order_out(dup)
        raise HTTPException(409, "Order could not be saved, please retry")
    db.refresh(order)
    return order_out(order)


@app.get("/orders/mine")
def my_orders(user: User = Depends(require_role(Role.customer)), db: Session = Depends(get_db)):
    orders = (
        db.query(Order)
        .filter_by(customer_id=user.id)
        .order_by(Order.created_at.desc())
        .limit(50)
        .all()
    )
    return [order_out(o) for o in orders]


@app.patch("/orders/{order_id}/status")
def update_order_status(
    order_id: int,
    body: StatusIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    order = db.get(Order, order_id, with_for_update=True)
    if order is None:
        raise HTTPException(404, "Order not found")

    if user.role == Role.customer:
        if order.customer_id != user.id:
            raise HTTPException(404, "Order not found")
        allowed = body.status == OrderStatus.cancelled and order.status == OrderStatus.placed
    elif user.role == Role.shopkeeper:
        shop = db.query(Shop).filter_by(owner_id=user.id).first()
        allowed = (
            shop is not None
            and shop.id == order.shop_id
            and body.status in TRANSITIONS.get(order.status, set())
        )
    else:
        allowed = False

    if not allowed:
        raise HTTPException(409, f"Cannot move order from {order.status.value} to {body.status.value}")

    if body.status == OrderStatus.cancelled:
        # Return reserved stock to the shelf
        for item in order.items:
            p = db.get(Product, item.product_id)
            if p is not None:
                p.stock += item.quantity
                db.add(InventoryLog(product_id=p.id, change=item.quantity, reason="order_cancelled"))

    order.status = body.status
    db.commit()
    db.refresh(order)
    return order_out(order)


@app.post("/orders/{order_id}/review", status_code=201)
def review_order(
    order_id: int,
    body: ReviewIn,
    user: User = Depends(require_role(Role.customer)),
    db: Session = Depends(get_db),
):
    order = db.get(Order, order_id)
    if order is None or order.customer_id != user.id:
        raise HTTPException(404, "Order not found")
    if order.status != OrderStatus.completed:
        raise HTTPException(409, "You can review an order after it is completed")
    if order.review is not None:
        raise HTTPException(409, "Order already reviewed")

    item_ids = [pr.order_item_id for pr in body.product_reviews]
    if len(item_ids) != len(set(item_ids)):
        raise HTTPException(422, "Duplicate product review")
    items = {i.id: i for i in order.items}
    if any(i not in items for i in item_ids):
        raise HTTPException(422, "Review refers to items not in this order")

    shop = db.get(Shop, order.shop_id)
    shop.shop_rating_avg, shop.shop_rating_count = bump_average(
        shop.shop_rating_avg, shop.shop_rating_count, body.shop_stars
    )
    delivery_stars = body.delivery_stars if order.fulfilment == "delivery" else None
    if delivery_stars is not None:
        shop.delivery_rating_avg, shop.delivery_rating_count = bump_average(
            shop.delivery_rating_avg, shop.delivery_rating_count, delivery_stars
        )

    db.add(OrderReview(order_id=order.id, shop_stars=body.shop_stars, delivery_stars=delivery_stars))
    for pr in body.product_reviews:
        item = items[pr.order_item_id]
        product = db.get(Product, item.product_id)
        if product is not None:
            product.rating_avg, product.rating_count = bump_average(
                product.rating_avg, product.rating_count, pr.stars
            )
        db.add(ProductReview(
            order_item_id=item.id,
            product_id=item.product_id,
            customer_id=user.id,
            stars=pr.stars,
        ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Order already reviewed")
    return {"status": "ok"}


# ---------- Shopkeeper ----------

@app.post("/shops", status_code=201)
def create_shop(
    body: ShopIn,
    user: User = Depends(require_role(Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    if db.query(Shop).filter_by(owner_id=user.id).first():
        raise HTTPException(409, "You already have a shop")
    shop = Shop(
        owner_id=user.id,
        invite_code=secrets.token_hex(4).upper(),
        **body.model_dump(),
    )
    db.add(shop)
    db.commit()
    db.refresh(shop)
    return {**shop_public(shop), "invite_code": shop.invite_code}


@app.get("/shop/me")
def my_shop(user: User = Depends(require_role(Role.shopkeeper)), db: Session = Depends(get_db)):
    shop = shop_owned_by(user, db)
    return {**shop_public(shop), "invite_code": shop.invite_code}


@app.patch("/shop/me")
def update_my_shop(
    body: ShopUpdate,
    user: User = Depends(require_role(Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    shop = shop_owned_by(user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)
    db.commit()
    return shop_public(shop)


@app.get("/shop/dashboard")
def dashboard(user: User = Depends(require_role(Role.shopkeeper)), db: Session = Depends(get_db)):
    shop = shop_owned_by(user, db)

    def revenue_since(since: Optional[datetime]) -> dict:
        q = db.query(
            func.coalesce(func.sum(Order.total), 0), func.count(Order.id)
        ).filter(Order.shop_id == shop.id, Order.status == OrderStatus.completed)
        if since is not None:
            q = q.filter(Order.created_at >= since)
        total, count = q.one()
        return {"revenue": str(total), "orders": count}

    today_start = datetime.combine(date.today(), datetime.min.time())
    all_orders = db.query(func.count(Order.id)).filter(Order.shop_id == shop.id).scalar()
    cancelled = (
        db.query(func.count(Order.id))
        .filter(Order.shop_id == shop.id, Order.status == OrderStatus.cancelled)
        .scalar()
    )
    pending = (
        db.query(func.count(Order.id))
        .filter(Order.shop_id == shop.id, Order.status.in_(ACTIVE_STATUSES))
        .scalar()
    )
    return {
        "shop": {"name": shop.name, "is_open": shop.is_open},
        "revenue_today": revenue_since(today_start),
        "revenue_7d": revenue_since(utc_now() - timedelta(days=7)),
        "revenue_all": revenue_since(None),
        "cancel_rate": round(cancelled / all_orders, 3) if all_orders else 0,
        "pending_orders": pending,
        "customers": db.query(func.count(CustomerShopLink.id)).filter_by(shop_id=shop.id).scalar(),
        "shop_rating": {"avg": round(shop.shop_rating_avg, 2), "count": shop.shop_rating_count},
        "delivery_rating": {"avg": round(shop.delivery_rating_avg, 2), "count": shop.delivery_rating_count},
    }


@app.post("/shop/products", status_code=201)
def add_product(
    body: ProductIn,
    user: User = Depends(require_role(Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    shop = shop_owned_by(user, db)
    product = Product(shop_id=shop.id, **body.model_dump())
    db.add(product)
    db.flush()
    db.add(InventoryLog(product_id=product.id, change=body.stock, reason="initial_stock"))
    db.commit()
    db.refresh(product)
    return product_out(product)


@app.patch("/shop/products/{product_id}")
def update_product(
    product_id: int,
    body: ProductUpdate,
    user: User = Depends(require_role(Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    shop = shop_owned_by(user, db)
    product = db.get(Product, product_id)
    if product is None or product.shop_id != shop.id:
        raise HTTPException(404, "Product not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    return product_out(product)


@app.post("/shop/products/{product_id}/restock")
def restock(
    product_id: int,
    body: RestockIn,
    user: User = Depends(require_role(Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    shop = shop_owned_by(user, db)
    product = db.get(Product, product_id, with_for_update=True)
    if product is None or product.shop_id != shop.id:
        raise HTTPException(404, "Product not found")
    if product.stock + body.quantity < 0:
        raise HTTPException(409, "Stock cannot go below zero")
    product.stock += body.quantity
    db.add(InventoryLog(product_id=product.id, change=body.quantity, reason=body.reason))
    db.commit()
    return product_out(product)


@app.get("/shop/inventory")
def inventory(user: User = Depends(require_role(Role.shopkeeper)), db: Session = Depends(get_db)):
    shop = shop_owned_by(user, db)
    products = (
        db.query(Product)
        .filter_by(shop_id=shop.id)
        .order_by(Product.category, Product.name)
        .all()
    )
    grouped: dict[str, list[dict]] = {}
    low_stock = []
    for p in products:
        grouped.setdefault(p.category, []).append(product_out(p))
        if p.is_active and p.stock <= LOW_STOCK_THRESHOLD:
            low_stock.append(p.name)
    return {
        "low_stock": low_stock,
        "categories": [{"name": name, "products": items} for name, items in grouped.items()],
    }


@app.get("/shop/orders")
def shop_orders(
    include_closed: bool = False,
    user: User = Depends(require_role(Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    shop = shop_owned_by(user, db)
    q = db.query(Order).filter(Order.shop_id == shop.id)
    if not include_closed:
        q = q.filter(Order.status.in_(ACTIVE_STATUSES))
    return [order_out(o) for o in q.order_by(Order.created_at.desc()).limit(100).all()]


@app.get("/shop/customers")
def my_customers(user: User = Depends(require_role(Role.shopkeeper)), db: Session = Depends(get_db)):
    shop = shop_owned_by(user, db)
    rows = (
        db.query(CustomerShopLink, User)
        .join(User, User.id == CustomerShopLink.customer_id)
        .filter(CustomerShopLink.shop_id == shop.id)
        .all()
    )
    spend = {
        cid: (count, total)
        for cid, count, total in db.query(
            Order.customer_id, func.count(Order.id), func.coalesce(func.sum(Order.total), 0)
        )
        .filter(Order.shop_id == shop.id, Order.status == OrderStatus.completed)
        .group_by(Order.customer_id)
        .all()
    }
    return [
        {
            "customer_id": u.id,
            "name": u.name,
            "phone": u.phone,
            "exclusive": link.exclusive,
            "completed_orders": spend.get(u.id, (0, 0))[0],
            "total_spend": str(spend.get(u.id, (0, 0))[1]),
        }
        for link, u in rows
    ]


@app.patch("/shop/customers/{customer_id}")
def bind_customer(
    customer_id: int,
    body: BindCustomerIn,
    user: User = Depends(require_role(Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    shop = shop_owned_by(user, db)
    link = membership(db, customer_id, shop.id)
    if link is None:
        raise HTTPException(404, "Customer is not a member of your shop")
    if body.exclusive:
        other = (
            db.query(CustomerShopLink)
            .filter(
                CustomerShopLink.customer_id == customer_id,
                CustomerShopLink.exclusive.is_(True),
                CustomerShopLink.shop_id != shop.id,
            )
            .first()
        )
        if other is not None:
            raise HTTPException(409, "Customer is already bound to another shop")
    link.exclusive = body.exclusive
    db.commit()
    return {"customer_id": customer_id, "exclusive": link.exclusive}


# ---------- Admin ----------

@app.get("/admin/overview")
def admin_overview(user: User = Depends(require_role(Role.admin)), db: Session = Depends(get_db)):
    roles = {r.value: c for r, c in db.query(User.role, func.count(User.id)).group_by(User.role).all()}
    statuses = {s.value: c for s, c in db.query(Order.status, func.count(Order.id)).group_by(Order.status).all()}
    since = utc_now() - timedelta(days=30)
    daily = (
        db.query(func.date(Order.created_at), func.sum(Order.total), func.count(Order.id))
        .filter(Order.created_at >= since, Order.status == OrderStatus.completed)
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
        .all()
    )
    top_shops = (
        db.query(Shop.id, Shop.name, Shop.shop_rating_avg, func.sum(Order.total))
        .join(Order, Order.shop_id == Shop.id)
        .filter(Order.status == OrderStatus.completed)
        .group_by(Shop.id, Shop.name, Shop.shop_rating_avg)
        .order_by(func.sum(Order.total).desc())
        .limit(10)
        .all()
    )
    return {
        "users_by_role": roles,
        "shops": db.query(func.count(Shop.id)).scalar(),
        "gross_merchandise_value": str(
            db.query(func.coalesce(func.sum(Order.total), 0))
            .filter(Order.status == OrderStatus.completed).scalar()
        ),
        "orders_by_status": statuses,
        "daily_revenue_30d": [
            {"date": str(d), "revenue": str(total), "orders": n} for d, total, n in daily
        ],
        "top_shops": [
            {"id": sid, "name": name, "rating": round(rating, 2), "revenue": str(rev)}
            for sid, name, rating, rev in top_shops
        ],
    }
