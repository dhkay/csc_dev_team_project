"""SQLAlchemy 2.0 ORM 모델 (DeclarativeBase + Mapped[...]).

도메인 엔티티와 별개: mappers.py 로만 변환한다.
한 (source, target_key) 당 한 행: 최신 결과 + 마지막 시도/조회 시각.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CollectionRecordModel(Base):
    __tablename__ = "collection_records"

    source: Mapped[str] = mapped_column(String, primary_key=True)
    target_key: Mapped[str] = mapped_column(String, primary_key=True)
    # 재수집에 필요한 전부(상대 표현). 크론이 target_key 를 역파싱하지 않고 그대로 재요청한다.
    params: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    # 최신 결과: 소스 codec 이 만든 안정형 JSON 배열. 미수집이면 NULL.
    items: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    # 수집 성공 시각(UTC). 미수집이면 NULL.
    collected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 마지막 시도 시각(성패 무관). items 가 NULL 인데 이 값이 있으면 = 시도했으나 실패.
    #   이 컬럼이 "아직 수집 전"과 "수집 실패"를 가르는 유일한 근거다.
    last_attempted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 마지막 조회 시각(lazy 활성 등록). 크론이 여기서 재수집 대상을 고르고, 오래된 건 버린다.
    last_requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
