"""SourcePlugin 구현: YouTube 검색 상위 영상과 지표.

벤더 기벽은 전부 여기와 파서, 어댑터에서 흡수하고 커널에는 안정형 JSON 만 넘긴다.

| 기벽 | 흡수 위치 |
|---|---|
| 검색 응답에 통계가 없고 설명이 잘린다 | 상세(`videos.list`)를 이어 부른다 |
| id 모양이 응답마다 다르다(`id.videoId` 대 `id`) | 파서가 둘 다 받는다 |
| 통계 숫자가 문자열이다 | 파서가 정수로 바꾼다 |
| 비공개 지표는 필드가 아예 없다 | None 으로 남긴다(0 으로 채우지 않는다) |
| 상세 응답 순서가 요청 순서와 다르다 | 파서가 검색 순서로 다시 맞춘다 |
| 검색 쿼터가 상세의 100배다 | 검색은 한 번만 부르고 페이지를 넘기지 않는다 |
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .....collection.core.domain.entities import CollectionTarget
from ....core.domain.codec import encode_videos
from ....core.domain.target import target_from_params
from ....core.domain.types import KEEP_COUNT, SOURCE_ID
from ..external.youtube import YouTubeAdapter
from ..parser import video_stats


class YouTubeVideoSource:
    """SourcePlugin 구현."""

    source_id = SOURCE_ID

    def __init__(self, client: YouTubeAdapter) -> None:
        self._client = client

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        return target_from_params(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return KEEP_COUNT

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        keyword = str(target.params["keyword"])
        search_payload = await self._client.search(keyword, KEEP_COUNT)
        if search_payload is None:
            return []
        video_ids = video_stats.extract_video_ids(search_payload)
        if not video_ids:
            return []
        videos_payload = await self._client.videos(video_ids)
        if videos_payload is None:
            return []
        # 안정형 정렬 = 검색이 정한 순서(조회수 순).
        return encode_videos(video_stats.parse_videos(videos_payload, video_ids))

    async def aclose(self) -> None:
        await self._client.aclose()
