"""도메인 엔티티 ↔ 저장 JSON 변환.

커널은 items 를 불투명한 JSON 으로 저장하므로 그 안의 형태는 이 소스가 소유한다.
형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 되므로 왕복 테스트로 고정한다.

`likeCount`/`commentCount` 는 null 을 그대로 저장한다. 0 으로 바꾸면 "반응이 없는 영상"과
"숫자를 숨긴 영상"이 구분되지 않는다.
"""

from __future__ import annotations

from typing import Any

from .entities import VideoStat


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def encode_videos(videos: list[VideoStat]) -> list[dict[str, Any]]:
    return [
        {
            "rank": v.rank,
            "videoId": v.video_id,
            "title": v.title,
            "channelTitle": v.channel_title,
            "publishedAt": v.published_at,
            "duration": v.duration,
            "viewCount": v.view_count,
            "likeCount": v.like_count,
            "commentCount": v.comment_count,
            "thumbnailUrl": v.thumbnail_url,
        }
        for v in videos
    ]


def decode_videos(items: list[dict[str, Any]]) -> list[VideoStat]:
    return [
        VideoStat(
            rank=int(raw.get("rank") or 0),
            video_id=str(raw["videoId"]),
            title=str(raw.get("title") or ""),
            channel_title=str(raw.get("channelTitle") or ""),
            published_at=str(raw.get("publishedAt") or ""),
            duration=str(raw.get("duration") or ""),
            view_count=int(raw.get("viewCount") or 0),
            like_count=_optional_int(raw.get("likeCount")),
            comment_count=_optional_int(raw.get("commentCount")),
            thumbnail_url=str(raw.get("thumbnailUrl") or ""),
        )
        for raw in items
        if isinstance(raw, dict) and raw.get("videoId")
    ]
