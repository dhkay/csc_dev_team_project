"""create media_jobs (video-model SSoT)

Revision ID: 0002_media_jobs
Revises: (none: 초기 마이그레이션)
Create Date: 2026-06-23

video-model 초기 스키마. legacy video_jobs 도메인 제거에 따라 media_jobs 가 base 다.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_media_jobs"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column(
            "params",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("source_file_id", sa.String(), nullable=True),
        sa.Column("result_file_id", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_media_jobs_status", "media_jobs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_media_jobs_status", table_name="media_jobs")
    op.drop_table("media_jobs")
