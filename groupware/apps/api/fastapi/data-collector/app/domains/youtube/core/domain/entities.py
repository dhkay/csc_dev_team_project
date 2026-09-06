"""도메인 엔티티 (순수: httpx/FastAPI/SQLAlchemy import 없음)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class VideoStat:
    """영상 한 건과 그 지표.

    like_count 와 comment_count 는 없을 수 있다. 채널이 비공개로 돌리면 필드 자체가 응답에서
    빠진다(0 이 아니다). 0 으로 채우면 "반응이 없는 영상"과 "숫자를 숨긴 영상"이 같아 보이므로
    None 으로 구분한다.

    duration 은 ISO 8601 기간 문자열(`PT3M34S`)이다. 초로 바꾸지 않고 그대로 나른다. 화면이
    필요한 형태가 무엇인지는 화면이 정할 일이고, 여기서 바꾸면 원래 표기가 사라진다.
    """

    rank: int
    video_id: str
    title: str
    channel_title: str
    published_at: str
    duration: str
    view_count: int
    like_count: int | None
    comment_count: int | None
    thumbnail_url: str
