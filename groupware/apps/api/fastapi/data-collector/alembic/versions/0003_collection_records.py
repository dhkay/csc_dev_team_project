"""datalab_keyword_ranks → collection_records (소스 다중화)

Revision ID: 0003_collection
Revises: 0002_buckets
Create Date: 2026-08-11

수집 저장소를 소스별 전용 테이블에서 (source, target_key) 키의 공용 테이블로 바꾼다.
소스가 늘어도 저장/크론/큐가 한 벌로 유지되게 하기 위한 변경이다.

기존 행은 그대로 이관한다. payload(JSON) 형태가 동일해서 변환이 필요 없다(0002 는 shape 이
달라 버렸지만 여기는 아니다). 덕분에 배포 직후 사용자에게 보이는 공백이 없다.

새 컬럼 last_attempted_at: 수집을 시도했다는 사실을 남긴다. 이게 없으면 "아직 수집 전"과
"시도했지만 못 얻음"이 둘 다 빈 결과로 보여서 소비자가 영원히 기다린다. 이관된 기존 행은
collected_at 을 그대로 시도 시각으로 삼는다(성공한 시도였으므로 사실과 맞는다).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_collection"
down_revision: Union[str, None] = "0002_buckets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DATALAB_SOURCE_ID = "NAVER_SHOPPING_INSIGHT"


def upgrade() -> None:
    op.create_table(
        "collection_records",
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("target_key", sa.String(), nullable=False),
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_attempted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("source", "target_key"),
    )
    # cron 의 활성 타깃 조회가 유휴 컷오프로 범위 스캔을 하도록.
    op.create_index(
        "ix_collection_records_last_requested_at",
        "collection_records",
        ["last_requested_at"],
    )
    op.execute(
        f"""
        INSERT INTO collection_records
            (source, target_key, params, items, collected_at, last_attempted_at, last_requested_at)
        SELECT '{_DATALAB_SOURCE_ID}',
               cid || ':' || period,
               jsonb_build_object('cid', cid, 'period', period),
               buckets,
               collected_at,
               collected_at,
               last_requested_at
        FROM datalab_keyword_ranks
        """
    )
    op.drop_table("datalab_keyword_ranks")


def downgrade() -> None:
    op.create_table(
        "datalab_keyword_ranks",
        sa.Column("cid", sa.String(), nullable=False),
        sa.Column("period", sa.String(), nullable=False),
        sa.Column("buckets", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("cid", "period"),
    )
    op.execute(
        f"""
        INSERT INTO datalab_keyword_ranks (cid, period, buckets, collected_at, last_requested_at)
        SELECT split_part(target_key, ':', 1),
               split_part(target_key, ':', 2),
               items, collected_at, last_requested_at
        FROM collection_records
        WHERE source = '{_DATALAB_SOURCE_ID}'
        """
    )
    op.drop_index("ix_collection_records_last_requested_at", table_name="collection_records")
    op.drop_table("collection_records")
