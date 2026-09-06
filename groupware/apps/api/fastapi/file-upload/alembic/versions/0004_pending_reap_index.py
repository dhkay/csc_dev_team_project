"""add (status, created_at) index for PENDING asset reaping

Revision ID: 0004_pending_reap_index
Revises: 0003_asset_ownership
Create Date: 2026-08-20

수거자(reap_pending_assets)의 조회 인덱스. 질의는 `status = 'PENDING' AND created_at < cutoff`
를 created_at 순으로 limit 만큼 읽는다. 이 인덱스가 없으면 자산이 쌓일수록 전체 스캔이 된다.

컬럼 추가는 없다(인덱스만). 순서가 (status, created_at) 인 이유: status 는 등호, created_at 은
범위 + 정렬이라 등호 컬럼이 앞에 와야 범위 조건과 ORDER BY 를 같은 인덱스로 처리한다.
"""

from __future__ import annotations

from alembic import op

revision = "0004_pending_reap_index"
down_revision = "0003_asset_ownership"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_upload_assets_status_created_at",
        "upload_assets",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_upload_assets_status_created_at", table_name="upload_assets")
