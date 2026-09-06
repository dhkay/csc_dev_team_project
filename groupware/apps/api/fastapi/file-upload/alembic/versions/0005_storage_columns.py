"""add storage browser columns to upload_assets

Revision ID: 0005_storage_columns
Revises: 0004_pending_reap_index
Create Date: 2026-08-24

스토리지 화면(공통/조직/개인 파일 브라우저)이 관리하는 자산을 구분하고 소유를 기록한다.

기존 행은 하나도 스토리지 자산으로 만들지 않는다. storage_area 를 backfill 하지 않으므로
아바타, 조직 로고, 마케팅 씬 이미지, 영상 산출물은 새 화면에 나타나지 않는다. 그것들은
/uploads/presign 으로 들어오고 그 경로에는 이 값을 넣을 방법이 없어서, 앞으로도 섞이지 않는다.
백필하는 것은 updated_at 하나뿐이고 정렬 기준을 만들기 위한 것이다.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_storage_columns"
down_revision = "0004_pending_reap_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "upload_assets", sa.Column("storage_area", sa.String(length=16), nullable=True)
    )
    op.add_column(
        "upload_assets", sa.Column("department_id", sa.Integer(), nullable=True)
    )
    op.add_column(
        "upload_assets", sa.Column("owner_user_id", sa.Integer(), nullable=True)
    )
    op.add_column(
        "upload_assets",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "upload_assets", sa.Column("deleted_by_user_id", sa.Integer(), nullable=True)
    )
    op.add_column(
        "upload_assets",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 서버 불변식을 DB 로 고정한다. 스토리지가 아닌 행은 어느 조건에도 걸리지 않는다.
    op.create_check_constraint(
        "ck_upload_assets_storage_area",
        "upload_assets",
        "storage_area IS NULL OR storage_area IN ('COMMON','DEPARTMENT','PERSONAL')",
    )
    op.create_check_constraint(
        "ck_upload_assets_storage_owner",
        "upload_assets",
        "storage_area IS NULL OR owner_user_id IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_upload_assets_storage_org",
        "upload_assets",
        "storage_area IS NULL OR organization_id IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_upload_assets_storage_department",
        "upload_assets",
        "(storage_area <> 'DEPARTMENT' OR department_id IS NOT NULL)"
        " AND (storage_area NOT IN ('COMMON','PERSONAL') OR department_id IS NULL)",
    )

    # 부분 인덱스: 스토리지가 아닌 행은 인덱스에 들어오지도 않는다.
    op.create_index(
        "ix_upload_assets_storage_area",
        "upload_assets",
        ["organization_id", "storage_area", sa.text("created_at DESC")],
        postgresql_where=sa.text("storage_area IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "ix_upload_assets_storage_department",
        "upload_assets",
        ["organization_id", "department_id", sa.text("created_at DESC")],
        postgresql_where=sa.text("storage_area = 'DEPARTMENT' AND deleted_at IS NULL"),
    )
    op.create_index(
        "ix_upload_assets_storage_owner",
        "upload_assets",
        ["organization_id", "owner_user_id", sa.text("created_at DESC")],
        postgresql_where=sa.text("storage_area = 'PERSONAL' AND deleted_at IS NULL"),
    )
    op.create_index(
        "ix_upload_assets_storage_trash",
        "upload_assets",
        ["organization_id", "deleted_at"],
        postgresql_where=sa.text("storage_area IS NOT NULL AND deleted_at IS NOT NULL"),
    )

    # 정렬 기준(coalesce(updated_at, created_at))이 기존 행에서도 성립하게 만든다.
    op.execute("UPDATE upload_assets SET updated_at = created_at")


def downgrade() -> None:
    op.drop_index("ix_upload_assets_storage_trash", table_name="upload_assets")
    op.drop_index("ix_upload_assets_storage_owner", table_name="upload_assets")
    op.drop_index("ix_upload_assets_storage_department", table_name="upload_assets")
    op.drop_index("ix_upload_assets_storage_area", table_name="upload_assets")
    op.drop_constraint(
        "ck_upload_assets_storage_department", "upload_assets", type_="check"
    )
    op.drop_constraint("ck_upload_assets_storage_org", "upload_assets", type_="check")
    op.drop_constraint("ck_upload_assets_storage_owner", "upload_assets", type_="check")
    op.drop_constraint("ck_upload_assets_storage_area", "upload_assets", type_="check")
    op.drop_column("upload_assets", "updated_at")
    op.drop_column("upload_assets", "deleted_by_user_id")
    op.drop_column("upload_assets", "deleted_at")
    op.drop_column("upload_assets", "owner_user_id")
    op.drop_column("upload_assets", "department_id")
    op.drop_column("upload_assets", "storage_area")
