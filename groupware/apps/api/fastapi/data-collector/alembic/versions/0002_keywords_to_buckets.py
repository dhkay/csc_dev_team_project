"""keywords(flat) → buckets(per-date)

Revision ID: 0002_buckets
Revises: 0001_init
Create Date: 2026-07-14

날짜별 인기 검색어 저장을 위해 최신결과 컬럼을 평탄 랭킹(keywords)에서
날짜별 버킷(buckets, [{"date","keywords":[{"rank","keyword"}]}])으로 교체한다.
구 데이터는 shape 이 달라 보존하지 않는다(다음 조회 시 재크롤: buckets NULL = 미수집).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_buckets"
down_revision: Union[str, None] = "0001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("datalab_keyword_ranks", "keywords")
    op.add_column(
        "datalab_keyword_ranks",
        sa.Column("buckets", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("datalab_keyword_ranks", "buckets")
    op.add_column(
        "datalab_keyword_ranks",
        sa.Column("keywords", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
