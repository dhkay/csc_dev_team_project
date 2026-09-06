"""lab 도메인 타입: 검증 대상 소스와 프로브 판정 결과."""

from __future__ import annotations

from enum import Enum


class LabSource(str, Enum):
    """검증 대상 외부 API. 값은 sandbox/api-test 의 실측 항목과 1:1 로 대응한다."""

    NAVER_DATALAB_SEARCH = "naver-datalab-search"  # apis.json No.3 (실측 200)
    NAVER_SHOPPING_CATEGORIES = (
        "naver-shopping-categories"  # No.4 (실측 401, 스코프 미등록)
    )
    NAVER_SHOPPING_KEYWORD_AGE = (
        "naver-shopping-keyword-age"  # No.5 (No.4 와 동일 원인)
    )
    NAVER_SEARCHAD_KEYWORDSTOOL = "naver-searchad-keywordstool"  # No.6 (실측 200)


class ProbeOutcome(str, Enum):
    """프로브 판정. 업스트림 실패와 우리 쪽 실패를 분리해서 표시한다.

    이 구분이 이 표면의 목적이다. "안 된다" 는 답은 쓸모가 없고, 누가 왜 거절했는지가 필요하다.
    """

    OK = "ok"  # 업스트림 2xx
    UPSTREAM_ERROR = "upstream_error"  # 업스트림 4xx/5xx. 본문을 그대로 보존한다
    CREDENTIALS_MISSING = (
        "credentials_missing"  # 우리 쪽 미설정. 호출 자체를 하지 않았다
    )
    UNREACHABLE = "unreachable"  # 연결/타임아웃. 업스트림 판단 불가
