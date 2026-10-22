"""Shopkeeper enrollment (KYC) and admin verification."""
import json
import re
import secrets
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from .auth import current_user, require_role
from .db import get_db
from .models import OrderStatus, Role, Shop, User

router = APIRouter()

VERIFIED, PENDING, REJECTED = "verified", "pending", "rejected"
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
GST_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
FSSAI_RE = re.compile(r"^[0-9]{14}$")
ACCOUNT_RE = re.compile(r"^[0-9]{9,18}$")


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def mask(value: str) -> str:
    return "•" * max(len(value) - 4, 0) + value[-4:]


class EnrollmentIn(BaseModel):
    shop_name: str = Field(min_length=3, max_length=160)
    legal_name: str = Field(min_length=3, max_length=160)
    owner_full_name: str = Field(min_length=3, max_length=120)
    address: str = Field(min_length=10, max_length=500)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    delivery_radius_km: float = Field(default=3.0, gt=0, le=20)
    pan_number: str
    gst_number: Optional[str] = None
    shop_license_number: str = Field(min_length=3, max_length=60)
    fssai_number: Optional[str] = None
    bank_account_number: str
    bank_ifsc: str
    documents: list[str] = Field(default_factory=list, max_length=10)
    declaration_accepted: bool

    @field_validator("pan_number", "gst_number", "fssai_number", "bank_ifsc", mode="before")
    @classmethod
    def normalise(cls, v):
        if v is None:
            return None
        return str(v).strip().upper() or None

    @field_validator("bank_account_number", mode="before")
    @classmethod
    def strip_spaces(cls, v):
        return str(v).replace(" ", "").strip()

    @field_validator("pan_number")
    @classmethod
    def check_pan(cls, v):
        if not PAN_RE.match(v):
            raise ValueError("PAN must look like ABCDE1234F")
        return v

    @field_validator("gst_number")
    @classmethod
    def check_gst(cls, v):
        if v and not GST_RE.match(v):
            raise ValueError("GST number is not valid")
        return v

    @field_validator("fssai_number")
    @classmethod
    def check_fssai(cls, v):
        if v and not FSSAI_RE.match(v):
            raise ValueError("FSSAI number must be 14 digits")
        return v

    @field_validator("bank_account_number")
    @classmethod
    def check_account(cls, v):
        if not ACCOUNT_RE.match(v):
            raise ValueError("Bank account number must be 9 to 18 digits")
        return v

    @field_validator("bank_ifsc")
    @classmethod
    def check_ifsc(cls, v):
        if not IFSC_RE.match(v):
            raise ValueError("IFSC code is not valid")
        return v

    @field_validator("declaration_accepted")
    @classmethod
    def must_accept(cls, v):
        if not v:
            raise ValueError("You must accept the declaration to continue")
        return v


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    reason: Optional[str] = Field(default=None, max_length=500)


def enrollment_out(shop: Shop, full: bool = False) -> dict:
    account = shop.bank_account_number or ""
    return {
        "shop_id": shop.id,
        "shop_name": shop.name,
        "verification_status": shop.verification_status,
        "rejection_reason": shop.rejection_reason,
        "submitted_at": iso(shop.submitted_at),
        "reviewed_at": iso(shop.reviewed_at),
        "legal_name": shop.legal_name,
        "owner_full_name": shop.owner_full_name,
        "address": shop.address,
        "lat": shop.lat,
        "lng": shop.lng,
        "delivery_radius_km": shop.delivery_radius_km,
        "pan_number": shop.pan_number,
        "gst_number": shop.gst_number,
        "shop_license_number": shop.shop_license_number,
        "fssai_number": shop.fssai_number,
        "bank_account_number": account if full else mask(account),
        "bank_ifsc": shop.bank_ifsc,
        "documents": json.loads(shop.documents) if shop.documents else [],
    }


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    shop = db.query(Shop).filter_by(owner_id=user.id).first() if user.role == Role.shopkeeper else None
    return {
        "user_id": user.id,
        "name": user.name,
        "phone": user.phone,
        "role": user.role.value,
        "shop": None if shop is None else {
            "id": shop.id,
            "name": shop.name,
            "verification_status": shop.verification_status,
            "rejection_reason": shop.rejection_reason,
            "is_open": shop.is_open,
        },
    }


@router.post("/shop/enrollment", status_code=201)
def submit_enrollment(
    body: EnrollmentIn,
    user: User = Depends(require_role(Role.shopkeeper)),
    db: Session = Depends(get_db),
):
    shop = db.query(Shop).filter_by(owner_id=user.id).first()
    if shop is not None and shop.verification_status == VERIFIED:
        raise HTTPException(409, "Your shop is verified. Contact support to change legal details.")
    if shop is None:
        shop = Shop(owner_id=user.id, invite_code=secrets.token_hex(4).upper(),
                    name=body.shop_name, address=body.address, lat=body.lat, lng=body.lng)
        db.add(shop)

    shop.name = body.shop_name
    shop.legal_name = body.legal_name
    shop.owner_full_name = body.owner_full_name
    shop.address = body.address
    shop.lat = body.lat
    shop.lng = body.lng
    shop.delivery_radius_km = body.delivery_radius_km
    shop.pan_number = body.pan_number
    shop.gst_number = body.gst_number
    shop.shop_license_number = body.shop_license_number
    shop.fssai_number = body.fssai_number
    shop.bank_account_number = body.bank_account_number
    shop.bank_ifsc = body.bank_ifsc
    shop.documents = json.dumps(body.documents)
    shop.verification_status = PENDING
    shop.rejection_reason = None
    shop.submitted_at = utc_now()
    shop.reviewed_at = None
    shop.reviewed_by_id = None
    db.commit()
    db.refresh(shop)
    return enrollment_out(shop)


@router.get("/shop/enrollment")
def my_enrollment(user: User = Depends(require_role(Role.shopkeeper)), db: Session = Depends(get_db)):
    shop = db.query(Shop).filter_by(owner_id=user.id).first()
    if shop is None:
        raise HTTPException(404, "No enrollment found")
    return enrollment_out(shop)


@router.get("/admin/applications")
def list_applications(
    status: str = Query("pending", pattern="^(pending|verified|rejected|all)$"),
    user: User = Depends(require_role(Role.admin)),
    db: Session = Depends(get_db),
):
    counts = dict(db.query(Shop.verification_status, func.count(Shop.id)).group_by(Shop.verification_status).all())
    q = db.query(Shop, User).join(User, User.id == Shop.owner_id)
    if status != "all":
        q = q.filter(Shop.verification_status == status)
    rows = q.order_by(Shop.submitted_at).all()
    return {
        "counts": {"pending": counts.get(PENDING, 0), "verified": counts.get(VERIFIED, 0),
                   "rejected": counts.get(REJECTED, 0), "all": sum(counts.values())},
        "items": [
            {
                "shop_id": shop.id,
                "shop_name": shop.name,
                "legal_name": shop.legal_name,
                "owner_name": owner.name,
                "owner_phone": owner.phone,
                "address": shop.address,
                "verification_status": shop.verification_status,
                "submitted_at": iso(shop.submitted_at),
                "rejection_reason": shop.rejection_reason,
            }
            for shop, owner in rows
        ],
    }


@router.get("/admin/applications/{shop_id}")
def application_detail(
    shop_id: int,
    user: User = Depends(require_role(Role.admin)),
    db: Session = Depends(get_db),
):
    row = db.query(Shop, User).join(User, User.id == Shop.owner_id).filter(Shop.id == shop_id).first()
    if row is None:
        raise HTTPException(404, "Application not found")
    shop, owner = row
    return {**enrollment_out(shop, full=True), "owner_name": owner.name, "owner_phone": owner.phone}


@router.post("/admin/applications/{shop_id}/decision")
def decide(
    shop_id: int,
    body: DecisionIn,
    admin: User = Depends(require_role(Role.admin)),
    db: Session = Depends(get_db),
):
    shop = db.get(Shop, shop_id)
    if shop is None:
        raise HTTPException(404, "Application not found")
    if shop.verification_status != PENDING:
        raise HTTPException(409, "This application is not pending review")
    approve = body.decision == "approve"
    if not approve and (not body.reason or len(body.reason.strip()) < 5):
        raise HTTPException(422, "Give a reason of at least 5 characters when rejecting")
    shop.verification_status = VERIFIED if approve else REJECTED
    shop.rejection_reason = None if approve else body.reason.strip()
    shop.reviewed_at = utc_now()
    shop.reviewed_by_id = admin.id
    db.commit()
    db.refresh(shop)
    return enrollment_out(shop, full=True)
