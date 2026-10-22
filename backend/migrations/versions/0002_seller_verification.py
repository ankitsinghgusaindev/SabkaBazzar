"""Seller enrollment (KYC) and admin verification fields on shops.

Idempotent: columns that already exist are skipped, so it is safe on
fresh databases (where 0001 already created them) and on existing ones.
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# (name, type, server_default, nullable)
NEW_COLUMNS = [
    ("verification_status", sa.String(20), "pending", False),
    ("legal_name", sa.String(160), "", False),
    ("owner_full_name", sa.String(120), "", False),
    ("pan_number", sa.String(10), "", False),
    ("gst_number", sa.String(15), None, True),
    ("shop_license_number", sa.String(60), "", False),
    ("fssai_number", sa.String(14), None, True),
    ("bank_account_number", sa.String(18), "", False),
    ("bank_ifsc", sa.String(11), "", False),
    ("documents", sa.Text(), None, True),
    ("rejection_reason", sa.Text(), None, True),
    ("submitted_at", sa.DateTime(), None, True),
    ("reviewed_at", sa.DateTime(), None, True),
    ("reviewed_by_id", sa.Integer(), None, True),
]
INDEX = "ix_shops_verification_status"


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    existing = {c["name"] for c in insp.get_columns("shops")}
    for name, col_type, default, nullable in NEW_COLUMNS:
        if name not in existing:
            op.add_column("shops", sa.Column(name, col_type, nullable=nullable, server_default=default))
    if INDEX not in {i["name"] for i in insp.get_indexes("shops")}:
        op.create_index(INDEX, "shops", ["verification_status"])


def downgrade() -> None:
    op.drop_index(INDEX, table_name="shops")
    for name, *_ in reversed(NEW_COLUMNS):
        op.drop_column("shops", name)
