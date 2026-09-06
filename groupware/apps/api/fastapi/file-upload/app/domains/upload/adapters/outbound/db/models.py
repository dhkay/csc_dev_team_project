"""SQLAlchemy 2.0 ORM 모델 (DeclarativeBase + Mapped[...] / mapped_column).

도메인 엔티티(core/domain/entities.py)와 별개다. mappers.py 로만 변환한다.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UploadAssetModel(Base):
    __tablename__ = "upload_assets"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    file_name: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String)
    size: Mapped[int] = mapped_column(Integer)
    object_key: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    # 엔티티가 tz-aware(UTC) 라 timestamptz 로 저장(asyncpg 는 naive 컬럼에 aware 값 insert 거부).
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # 서버간 결과 저장 멱등 키(=media job_id). 일반 업로드는 NULL, unique 로 중복 저장 차단.
    idempotency_key: Mapped[str | None] = mapped_column(
        String, nullable=True, unique=True
    )
    # 소유 인덱스: 조직 귀속. "조직 파일 집합" 조회(삭제/아카이브/복구/접근통제)의 기준.
    # 전부 nullable(platform/flat 산출물은 org 미상일 수 있음). organization_id 로 조회하므로 인덱스.
    scope: Mapped[str | None] = mapped_column(String, nullable=True)
    organization_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 스토리지 화면 자산 전용 컬럼
    # storage_area 가 NULL 이면 스토리지 자산이 아니다. 모든 스토리지 조회가 이 술어를 달고,
    #   아래 인덱스도 전부 그 조건의 부분 인덱스라 다른 자산은 인덱스에 들어오지도 않는다.
    storage_area: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # userdb departments.id / organization_users.id. 다른 DB 라 FK 를 걸 수 없다(크로스-DB 금지).
    department_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    owner_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_upload_assets_organization_id", "organization_id"),
        # 수거자 조회: status 등호 + created_at 범위/정렬. 등호 컬럼이 앞에 와야 한 인덱스로 처리된다.
        Index("ix_upload_assets_status_created_at", "status", "created_at"),
        # 서버 불변식을 DB 로 고정한다. 스토리지 자산이면 소유가 반드시 있고, 부서 영역이면 부서가
        #   있고, 공통/개인 영역이면 부서가 없다. 스토리지가 아닌 행은 어느 조건에도 걸리지 않는다.
        CheckConstraint(
            "storage_area IS NULL OR storage_area IN ('COMMON','DEPARTMENT','PERSONAL')",
            name="ck_upload_assets_storage_area",
        ),
        CheckConstraint(
            "storage_area IS NULL OR owner_user_id IS NOT NULL",
            name="ck_upload_assets_storage_owner",
        ),
        CheckConstraint(
            "storage_area IS NULL OR organization_id IS NOT NULL",
            name="ck_upload_assets_storage_org",
        ),
        CheckConstraint(
            "(storage_area <> 'DEPARTMENT' OR department_id IS NOT NULL)"
            " AND (storage_area NOT IN ('COMMON','PERSONAL') OR department_id IS NULL)",
            name="ck_upload_assets_storage_department",
        ),
        # 영역 루트/폴더 목록 + 조직 사용량 합계.
        Index(
            "ix_upload_assets_storage_area",
            "organization_id",
            "storage_area",
            text("created_at DESC"),
            postgresql_where=text("storage_area IS NOT NULL AND deleted_at IS NULL"),
        ),
        # 부서 영역 목록: 인가된 부서 id 집합으로 좁힌다.
        Index(
            "ix_upload_assets_storage_department",
            "organization_id",
            "department_id",
            text("created_at DESC"),
            postgresql_where=text(
                "storage_area = 'DEPARTMENT' AND deleted_at IS NULL"
            ),
        ),
        # 개인 영역 목록: 본인 것만.
        Index(
            "ix_upload_assets_storage_owner",
            "organization_id",
            "owner_user_id",
            text("created_at DESC"),
            postgresql_where=text("storage_area = 'PERSONAL' AND deleted_at IS NULL"),
        ),
        # 휴지통 목록 + 보존기간 지난 것 정리(4단계).
        Index(
            "ix_upload_assets_storage_trash",
            "organization_id",
            "deleted_at",
            postgresql_where=text(
                "storage_area IS NOT NULL AND deleted_at IS NOT NULL"
            ),
        ),
    )
