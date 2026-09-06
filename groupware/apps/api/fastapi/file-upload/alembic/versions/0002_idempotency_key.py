"""add upload_assets.idempotency_key (서버간 결과 저장 멱등 키)

Revision ID: 0002_idempotency_key
Revises: 0001_initial
Create Date: 2026-06-23

worker->file-service 결과 저장(POST /uploads/store)의 멱등 보장용. NULL 허용 + unique.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_idempotency_key"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "upload_assets",
        sa.Column("idempotency_key", sa.String(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_upload_assets_idempotency_key", "upload_assets", ["idempotency_key"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_upload_assets_idempotency_key", "upload_assets", type_="unique"
    )
    op.drop_column("upload_assets", "idempotency_key")
