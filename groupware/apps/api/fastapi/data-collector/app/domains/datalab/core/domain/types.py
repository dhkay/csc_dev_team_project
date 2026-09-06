"""도메인 타입 + 수집기간→네이버 timeUnit/유지개수 매핑(SSOT).

네이버 데이터랩 `getKeywordRank` 는 timeUnit(date/week/month)만 주면 날짜별 랭킹을
한 번에(최신 12개, 각 상위 10) canonical 날짜로 돌려준다. 그래서 크롤러가 날짜 범위를
직접 계산하지 않는다(KST/달력주/롤링 등 날짜 계산 불필요. 네이버 date 필드를 그대로 라벨로 씀).
"""

from __future__ import annotations

from enum import Enum

# 제품 수준 소스 식별자. AI 도구의 소스 설정 key, 수집 서버 카탈로그가 같은 문자열을 쓴다.
#   수집기 내부 경로(/datalab/shopping-keywords)와는 별개다: 그건 엔드포인트지 소스 id 가 아니다.
SOURCE_ID = "NAVER_SHOPPING_INSIGHT"


class Period(str, Enum):
    """수집기간(일간/주간/월간)."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class TimeUnit(str, Enum):
    """네이버 데이터랩 집계 단위(getKeywordRank timeUnit)."""

    DATE = "date"
    WEEK = "week"
    MONTH = "month"


# 수집기간 → getKeywordRank timeUnit.
TIME_UNIT_FOR: dict[Period, TimeUnit] = {
    Period.DAILY: TimeUnit.DATE,
    Period.WEEKLY: TimeUnit.WEEK,
    Period.MONTHLY: TimeUnit.MONTH,
}

# 기간별 유지할 최신 버킷 수: getKeywordRank 는 timeUnit 당 12개를 주며, 그중 최신 N개만 저장.
#   일간 2주(제공 12일), 주간 12주, 월간 최근 3개월.
KEEP_COUNT: dict[Period, int] = {
    Period.DAILY: 12,
    Period.WEEKLY: 12,
    Period.MONTHLY: 3,
}
