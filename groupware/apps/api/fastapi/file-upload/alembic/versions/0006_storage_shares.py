"""add storage_shares (공통 영역 파일의 공개 링크)

Revision ID: 0006_storage_shares
Revises: 0005_storage_columns
Create Date: 2026-08-25

스토리지 파일은 기본적으로 조직 안에서만 오간다. 이 표는 공통 영역 파일에 한해 그 규칙을
사람이 명시적으로 여는 자리다. 여는 것과 새는 것을 가르는 것이 이 표의 존재 이유이므로,
행이 있다는 사실 자체가 "누군가 공개하기로 결정했다" 는 기록이다.

영역(COMMON)을 여기 복제하지 않는다. 파일이 다른 영역으로 옮겨지면 두 값이 어긋나고 어긋난
쪽이 공개 여부를 결정하게 된다. 판정은 언제나 자산의 지금 상태를 보고 한다.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_storage_shares"
down_revision = "0005_storage_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "storage_shares",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "upload_id",
            sa.String(),
            sa.ForeignKey("upload_assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    # 한 파일에 살아 있는 링크는 하나.
    op.create_index(
        "ux_storage_shares_live_upload",
        "storage_shares",
        ["upload_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_index(
        "ix_storage_shares_organization_id", "storage_shares", ["organization_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_storage_shares_organization_id", table_name="storage_shares")
    op.drop_index("ux_storage_shares_live_upload", table_name="storage_shares")
    op.drop_table("storage_shares")
