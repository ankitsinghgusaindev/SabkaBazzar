from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, Numeric,
    String, Text, UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class Role(str, Enum):
    customer = "customer"
    shopkeeper = "shopkeeper"
    admin = "admin"


class OrderStatus(str, Enum):
    placed = "placed"
    confirmed = "confirmed"
    packed = "packed"
    ready = "ready"          # ready for pickup, or handed to the delivery leg
    completed = "completed"
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(SAEnum(Role))
    # Last live location reported by the app while it is open
    last_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    shop: Mapped[Optional["Shop"]] = relationship(back_populates="owner", uselist=False)


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    address: Mapped[str] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float, index=True)
    lng: Mapped[float] = mapped_column(Float, index=True)
    delivery_radius_km: Mapped[float] = mapped_column(Float, default=3.0)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    members_only: Mapped[bool] = mapped_column(Boolean, default=False)
    invite_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    shop_rating_avg: Mapped[float] = mapped_column(Float, default=0.0)
    shop_rating_count: Mapped[int] = mapped_column(Integer, default=0)
    delivery_rating_avg: Mapped[float] = mapped_column(Float, default=0.0)
    delivery_rating_count: Mapped[int] = mapped_column(Integer, default=0)

    # Enrollment (KYC) and admin verification
    verification_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending | verified | rejected
    legal_name: Mapped[str] = mapped_column(String(160), default="")
    owner_full_name: Mapped[str] = mapped_column(String(120), default="")
    pan_number: Mapped[str] = mapped_column(String(10), default="")
    gst_number: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    shop_license_number: Mapped[str] = mapped_column(String(60), default="")
    fssai_number: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)
    bank_account_number: Mapped[str] = mapped_column(String(18), default="")  # encrypt at rest before production
    bank_ifsc: Mapped[str] = mapped_column(String(11), default="")
    documents: Mapped[Optional[str]] = mapped_column(Text, nullable=True)     # JSON list of "KEY:filename"
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    owner: Mapped[User] = relationship(back_populates="shop")
    products: Mapped[list["Product"]] = relationship(cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60), index=True)
    unit: Mapped[str] = mapped_column(String(30))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    stock: Mapped[int] = mapped_column(Integer, default=0)
    discount_percent: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    rating_avg: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)


class InventoryLog(Base):
    """Audit trail for every stock change, so inventory can always be reconciled."""
    __tablename__ = "inventory_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    change: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CustomerShopLink(Base):
    """A customer's membership of a shop. exclusive=True means the shop has bound them."""
    __tablename__ = "customer_shop_links"
    __table_args__ = (UniqueConstraint("customer_id", "shop_id", name="uq_customer_shop"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    exclusive: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("customer_id", "idempotency_key", name="uq_order_idempotency"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    status: Mapped[OrderStatus] = mapped_column(SAEnum(OrderStatus), index=True)
    fulfilment: Mapped[str] = mapped_column(String(10))  # "pickup" | "delivery"
    delivery_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    items: Mapped[list["OrderItem"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    review: Mapped[Optional["OrderReview"]] = relationship(back_populates="order", uselist=False)


class OrderItem(Base):
    """Snapshot of name and price at purchase time, so history never changes."""
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer)


class OrderReview(Base):
    __tablename__ = "order_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    shop_stars: Mapped[int] = mapped_column(Integer)
    delivery_stars: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    order: Mapped[Order] = relationship(back_populates="review")


class ProductReview(Base):
    __tablename__ = "product_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id"), unique=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    stars: Mapped[int] = mapped_column(Integer)
