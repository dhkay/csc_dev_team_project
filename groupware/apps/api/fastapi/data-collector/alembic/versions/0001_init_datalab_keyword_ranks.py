"""init datalab_keyword_ranks

Revision ID: 0001_init
Revises:
Create Date: 2026-07-13

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "datalab_keyword_ranks",
        sa.Column("cid", sa.String(), nullable=False),
        sa.Column("period", sa.String(), nullable=False),
        # 최신 결과: [{"rank": int, "keyword": str}, ...]. 미수집이면 NULL.
        sa.Column("keywords", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("cid", "period"),
    )


def downgrade() -> None:
    op.drop_table("datalab_keyword_ranks")
