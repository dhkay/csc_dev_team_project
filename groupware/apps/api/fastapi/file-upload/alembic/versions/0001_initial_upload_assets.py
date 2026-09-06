"""initial upload_assets

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-22

upload_assets 최초 테이블. 컬럼은 ORM 모델(adapters/outbound/db/models.py)과 일치.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "upload_assets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("file_name", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("object_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("upload_assets")
