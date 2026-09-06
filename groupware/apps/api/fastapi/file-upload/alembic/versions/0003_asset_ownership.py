"""add upload_assets ownership index (scope / organization_id)

Revision ID: 0003_asset_ownership
Revises: 0002_idempotency_key
Create Date: 2026-07-27

"조직 파일 집합"을 object_key 문자열 파싱 없이 DB 로 조회하기 위한 소유 인덱스.
조직 삭제/아카이브/복구 + 조직 스코프 접근통제의 기준. 전부 nullable(additive).
기존 행은 object_key(`groupware/<orgId>/...`, `platform/...`)에서 backfill.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_asset_ownership"
down_revision = "0002_idempotency_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("upload_assets", sa.Column("scope", sa.String(), nullable=True))
    op.add_column(
        "upload_assets", sa.Column("organization_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        "ix_upload_assets_organization_id", "upload_assets", ["organization_id"]
    )

    # 기존 행 backfill (Postgres): object_key 1차 폴더가 유효 scope 면 채운다.
    #  flat 산출물(object_key=uuid, 슬래시 없음)은 scope 미상 → NULL 유지.
    op.execute(
        """
        UPDATE upload_assets
        SET scope = split_part(object_key, '/', 1)
        WHERE split_part(object_key, '/', 1) IN ('platform', 'groupware')
        """
    )
    #  groupware 는 2번째 세그먼트가 orgId(숫자): 숫자일 때만 캐스팅해 채운다.
    op.execute(
        """
        UPDATE upload_assets
        SET organization_id = split_part(object_key, '/', 2)::int
        WHERE scope = 'groupware'
          AND split_part(object_key, '/', 2) ~ '^[0-9]+$'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_upload_assets_organization_id", table_name="upload_assets")
    op.drop_column("upload_assets", "organization_id")
    op.drop_column("upload_assets", "scope")
