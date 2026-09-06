"""SQLAlchemy 2.0 ORM 모델 (video_jobs). 도메인 엔티티와 별개: mappers.py 로만 변환."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class VideoJobModel(Base):
    __tablename__ = "video_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    type: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, index=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    source_file_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # 호출자 멱등키. 부분 유니크(아래 __table_args__)로 같은 키의 잡이 하나임을 DB 가 보장한다:
    #   호출자가 재시도해도(크래시 뒤 재실행 포함) 유료 잡이 두 개 생기지 않는다.
    client_request_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    result_file_id: Mapped[str | None] = mapped_column(String, nullable=True)
    captions_file_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # 청구 단위(외부 유료 provider 렌더만). JSONB 인 이유: 형태가 자란다(지금은 씬별 배열, 나중에
    #   다른 벤더 단위): params 도 같은 이유로 JSONB 다. 내부 provider 는 NULL(무료의 표현).
    usage: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # 씬별 결과(COMPOSE 만). usage 와 같은 이유로 영속한다: 체크포인트는 성공 시 지워지고 24시간
    #   TTL 이라, 완료된 잡의 씬별 클립을 되살릴 방법이 여기밖에 없다. 그 클립 id 가 세그먼트 격자와
    #   씬 단위 재렌더를 성립시킨다(재렌더 시 이 값으로 체크포인트를 되살려 나머지 씬을 건너뛴다).
    scene_states: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 실패 사유 코드(RenderFailure 값). 짧은 식별자라 varchar(40)로 충분하다.
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # 멱등키가 있을 때만 유일하다. NULL 은 유니크에서 서로 다르게 취급되므로 키를 쓰지 않는
        #   호출자를 막지 않는다. 이 인덱스가 최후 방어선이다: 호출자가 사전 조회를 통과해 동시에
        #   등록해도 하나만 남고, 진 쪽은 재조회해서 이긴 잡을 받는다.
        Index(
            "video_jobs_client_request_uq",
            "client_request_id",
            unique=True,
            postgresql_where=text("client_request_id IS NOT NULL"),
        ),
    )
