"""데이터랩 getKeywordRank 응답 파싱(로컬).

getKeywordRank 응답 = 날짜별 객체 배열(오름차순):
  [{"date":"2026/07/01","datetime":"...","ranks":[{"rank":1,"keyword":"..."}, ...]}, ...]
각 객체를 날짜 버킷으로 변환한다. 라벨은 기간별로: 일/주=YYYY-MM-DD(주는 주 시작일), 월=YYYY-MM.
"""

from __future__ import annotations

import json
from typing import Any

from ....core.domain.entities import KeywordBucket, KeywordRank
from ....core.domain.types import Period

# 날짜(포인트)별 상위 N.
TOP_N = 10


class DatalabShoppingKeywordParser:
    """getKeywordRank 배열 → 날짜 버킷 목록(오름차순). 정렬 뒤집기는 플러그인이 한다."""

    def parse(self, html: str, period: Period) -> list[KeywordBucket]:
        if not html:
            return []
        text = html.strip()
        if text.startswith("ERROR:"):
            return []
        try:
            data = json.loads(text)
        except ValueError:
            return []
        if not isinstance(data, list):
            return []
        buckets: list[KeywordBucket] = []
        for obj in data:
            if not isinstance(obj, dict):
                continue
            keywords = _parse_ranks(obj.get("ranks"))
            if not keywords:
                continue
            buckets.append(
                KeywordBucket(date=_label(obj.get("date"), period), keywords=keywords)
            )
        return buckets


def _parse_ranks(raw: Any) -> list[KeywordRank]:
    out: list[KeywordRank] = []
    for it in raw or []:
        if not isinstance(it, dict):
            continue
        kw = str(it.get("keyword") or "").strip()
        if not kw:
            continue
        rk = it.get("rank")
        out.append(KeywordRank(rank=int(rk) if rk else len(out) + 1, keyword=kw))
        if len(out) >= TOP_N:
            break
    return out


def _label(raw: Any, period: Period) -> str:
    """네이버 date("2026/07/01") → 라벨. 월간은 YYYY-MM, 나머지는 YYYY-MM-DD."""
    s = str(raw or "").strip().replace("/", "-")
    if period is Period.MONTHLY:
        return s[:7]
    return s
