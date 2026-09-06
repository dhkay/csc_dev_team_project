"""rename media_jobs -> video_jobs (video-model 내부 네이밍 일관화)

Revision ID: 0003_rename_video_jobs
Revises: 0002_media_jobs
Create Date: 2026-07-07

video-model 서버 내부 도메인을 media -> video 로 일관화하면서 테이블/인덱스도 리네임.
데이터 보존(rename, drop/create 아님). autogenerate 는 rename 을 감지 못하므로 수기 작성.
"""

from __future__ import annotations

from alembic import op

revision = "0003_rename_video_jobs"
down_revision = "0002_media_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("media_jobs", "video_jobs")
    op.execute("ALTER INDEX ix_media_jobs_status RENAME TO ix_video_jobs_status")


def downgrade() -> None:
    op.execute("ALTER INDEX ix_video_jobs_status RENAME TO ix_media_jobs_status")
    op.rename_table("video_jobs", "media_jobs")
