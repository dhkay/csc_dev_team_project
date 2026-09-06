"""YouTube 응답 파서. 두 응답(검색, 상세)을 합쳐 영상 목록을 만든다.

id 의 모양이 응답마다 다르다. `search.list` 는 `id.videoId` 객체로, `videos.list` 는 `id`
문자열로 준다. 같은 코드로 읽으려다 한쪽이 조용히 비는 자리다.

통계 숫자가 문자열로 온다. `viewCount: "1802537332"` 처럼 온다. 정렬이나 비교를 하려면
정수로 바꿔야 한다.

비공개 지표는 필드 자체가 없다. 좋아요와 댓글을 숨긴 채널이면 키가 아예 빠진다. 0 으로
채우지 않고 None 으로 남긴다.
"""

from __future__ import annotations

from typing import Any

from ....core.domain.entities import VideoStat


def extract_video_ids(search_payload: Any) -> list[str]:
    """검색 응답에서 영상 id 만 뽑는다(상세 조회의 입력이 된다).

    `maxResults` 는 상한이지 보장이 아니다(3 을 요청해 2건이 온 실측이 있다). 그래서 요청한
    개수를 신뢰하지 않고 실제로 온 것만 쓴다.
    """
    if not isinstance(search_payload, dict):
        return []
    ids: list[str] = []
    for item in search_payload.get("items") or []:
        if not isinstance(item, dict):
            continue
        raw_id = item.get("id")
        video_id = raw_id.get("videoId") if isinstance(raw_id, dict) else raw_id
        if isinstance(video_id, str) and video_id and video_id not in ids:
            ids.append(video_id)
    return ids


def _to_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_videos(videos_payload: Any, order: list[str]) -> list[VideoStat]:
    """상세 응답 → 영상 목록. 순서는 검색 응답의 순서(`order`)를 따른다.

    `videos.list` 는 요청 순서를 보장하지 않는다. 검색이 정한 순위가 곧 우리 순위이므로
    여기서 다시 맞춘다.
    """
    if not isinstance(videos_payload, dict):
        return []

    by_id: dict[str, VideoStat] = {}
    for item in videos_payload.get("items") or []:
        if not isinstance(item, dict):
            continue
        video_id = item.get("id")
        if not isinstance(video_id, str) or not video_id:
            continue
        snippet = item.get("snippet") or {}
        statistics = item.get("statistics") or {}
        details = item.get("contentDetails") or {}
        thumbnails = snippet.get("thumbnails") or {}
        best = thumbnails.get("high") or thumbnails.get("medium") or thumbnails.get("default") or {}
        by_id[video_id] = VideoStat(
            rank=0,  # 아래에서 검색 순서대로 매긴다.
            video_id=video_id,
            title=str(snippet.get("title") or ""),
            channel_title=str(snippet.get("channelTitle") or ""),
            published_at=str(snippet.get("publishedAt") or ""),
            duration=str(details.get("duration") or ""),
            view_count=_to_int(statistics.get("viewCount")),
            like_count=_optional_int(statistics.get("likeCount")),
            comment_count=_optional_int(statistics.get("commentCount")),
            thumbnail_url=str(best.get("url") or ""),
        )

    ordered: list[VideoStat] = []
    for video_id in order:
        video = by_id.get(video_id)
        if video is None:
            # 검색에는 있었지만 상세에서 빠진 영상(그 사이 삭제되거나 비공개 전환).
            continue
        video.rank = len(ordered) + 1
        ordered.append(video)
    return ordered
