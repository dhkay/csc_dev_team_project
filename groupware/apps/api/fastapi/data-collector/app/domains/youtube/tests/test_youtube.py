"""유튜브 소스 테스트: 두 호출 합치기, id 모양 차이, 문자열 통계, 숨긴 지표, 순서 복원."""

from __future__ import annotations

import httpx
import pytest

from app.domains.youtube.adapters.outbound.collection.plugin import YouTubeVideoSource
from app.domains.youtube.adapters.outbound.external.youtube import YouTubeAdapter
from app.domains.youtube.adapters.outbound.parser import video_stats
from app.domains.youtube.core.domain.codec import decode_videos, encode_videos
from app.domains.youtube.core.domain.target import make_target

# search.list 는 id 를 객체로 준다.
SEARCH = {
    "items": [
        {"id": {"kind": "youtube#video", "videoId": "aaa"}, "snippet": {"title": "가"}},
        {"id": {"kind": "youtube#video", "videoId": "bbb"}, "snippet": {"title": "나"}},
    ]
}
# videos.list 는 id 를 문자열로 주고, 통계 숫자도 문자열이다. 순서는 요청과 다를 수 있다.
VIDEOS = {
    "items": [
        {
            "id": "bbb",
            "snippet": {
                "title": "나 영상",
                "channelTitle": "채널나",
                "publishedAt": "2026-01-02T00:00:00Z",
                "thumbnails": {"high": {"url": "https://img/bbb.jpg"}},
            },
            "contentDetails": {"duration": "PT10M"},
            # 좋아요와 댓글을 숨긴 채널: 필드 자체가 없다.
            "statistics": {"viewCount": "500"},
        },
        {
            "id": "aaa",
            "snippet": {
                "title": "가 영상",
                "channelTitle": "채널가",
                "publishedAt": "2026-01-01T00:00:00Z",
                "thumbnails": {"high": {"url": "https://img/aaa.jpg"}},
            },
            "contentDetails": {"duration": "PT3M34S"},
            "statistics": {"viewCount": "1802537332", "likeCount": "19325", "commentCount": "24"},
        },
    ]
}


def _source(handler) -> YouTubeVideoSource:
    return YouTubeVideoSource(
        YouTubeAdapter(
            base_url="https://youtube.example.com",
            api_key="key",
            timeout=1.0,
            transport=httpx.MockTransport(handler),
        )
    )


def test_search_ids_come_from_an_object_not_a_string() -> None:
    """`search.list` 는 `id.videoId`, `videos.list` 는 `id` 문자열이다."""
    assert video_stats.extract_video_ids(SEARCH) == ["aaa", "bbb"]


def test_detail_order_is_restored_to_search_order() -> None:
    """상세 응답은 요청 순서를 보장하지 않는다. 순위를 정한 것은 검색이다."""
    videos = video_stats.parse_videos(VIDEOS, ["aaa", "bbb"])

    assert [v.video_id for v in videos] == ["aaa", "bbb"]
    assert [v.rank for v in videos] == [1, 2]


def test_string_statistics_become_numbers() -> None:
    videos = video_stats.parse_videos(VIDEOS, ["aaa"])

    assert videos[0].view_count == 1802537332
    assert videos[0].like_count == 19325


def test_hidden_metrics_stay_none_not_zero() -> None:
    """0 으로 채우면 '반응이 없는 영상'과 '숫자를 숨긴 영상'이 같아 보인다."""
    hidden = video_stats.parse_videos(VIDEOS, ["bbb"])[0]

    assert hidden.like_count is None
    assert hidden.comment_count is None


def test_video_missing_from_detail_is_dropped() -> None:
    """검색과 상세 사이에 삭제되거나 비공개로 바뀐 영상이 있을 수 있다."""
    videos = video_stats.parse_videos(VIDEOS, ["aaa", "없는id", "bbb"])

    assert [v.video_id for v in videos] == ["aaa", "bbb"]


def test_codec_round_trip_keeps_null_metrics() -> None:
    original = video_stats.parse_videos(VIDEOS, ["aaa", "bbb"])

    assert decode_videos(encode_videos(original)) == original


@pytest.mark.asyncio
async def test_collect_calls_search_once_then_details() -> None:
    """검색이 상세의 100배 쿼터를 쓴다. 검색은 한 번만 부르고 페이지를 넘기지 않는다."""
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json=SEARCH)
        return httpx.Response(200, json=VIDEOS)

    items = await _source(handler).collect(make_target("김치찌개"))

    assert paths == ["/youtube/v3/search", "/youtube/v3/videos"]
    assert [i["videoId"] for i in items] == ["aaa", "bbb"]
    assert items[1]["likeCount"] is None


@pytest.mark.asyncio
async def test_empty_search_skips_the_detail_call() -> None:
    """검색이 비면 상세를 부를 이유가 없다(쿼터 낭비)."""
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json={"items": []})

    assert await _source(handler).collect(make_target("없는말")) == []
    assert paths == ["/youtube/v3/search"]


@pytest.mark.asyncio
async def test_missing_api_key_skips_the_call_entirely() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json=SEARCH)

    source = YouTubeVideoSource(
        YouTubeAdapter(
            base_url="https://youtube.example.com",
            api_key="",
            timeout=1.0,
            transport=httpx.MockTransport(handler),
        )
    )
    assert await source.collect(make_target("김치찌개")) == []
    assert called is False
    await source.aclose()
