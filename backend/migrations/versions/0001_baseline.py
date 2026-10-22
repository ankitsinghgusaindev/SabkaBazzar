"""Baseline. Creates the schema only on brand-new databases.

Existing databases (dev, UAT, production, your laptop) already have these
tables, so this step does nothing there and 0002 brings them up to date.
"""
import sqlalchemy as sa
from alembic import op

from app.models import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "users" not in sa.inspect(bind).get_table_names():
        Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    # Never drop the baseline schema automatically.
    pass
