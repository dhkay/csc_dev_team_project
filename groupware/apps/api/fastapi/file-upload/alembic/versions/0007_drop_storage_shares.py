"""drop storage_shares (공통 영역이 공개로 바뀌어 링크 표가 필요 없어짐)

Revision ID: 0007_drop_storage_shares
Revises: 0006_storage_shares
Create Date: 2026-08-25

공통 영역 파일은 이제 주소만 알면 로그인 없이 열린다. 그러면 파일별 공개 링크(토큰, 만료,
해지)가 남아 있어도 의미가 없다. 평범한 주소가 계속 열리므로 토큰을 해지해도 받은 사람은 원래
주소를 쓰면 그만이고, 그 상태는 "해지했다" 는 화면과 어긋난다. 약한 쪽이 실제 보안 수준이 되므로
표를 지우고 메커니즘을 하나로 남긴다.

앞 리비전(0006)을 고치지 않고 새 리비전으로 지우는 이유: 이미 적용된 환경이 있으면 그 환경의
alembic_version 이 0006 을 가리킨다. 파일을 지우면 그 환경이 자기 위치를 잃는다.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_drop_storage_shares"
down_revision = "0006_storage_shares"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_storage_shares_organization_id", table_name="storage_shares")
    op.drop_index("ux_storage_shares_live_upload", table_name="storage_shares")
    op.drop_table("storage_shares")


def downgrade() -> None:
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
