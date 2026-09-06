"""도메인 타입: 소스 식별자, 수집기간 ↔ 벤더 집계단위/창 길이 매핑(SSOT).

저장하는 것은 기간 이름뿐이고 날짜는 저장하지 않는다. 데이터랩 검색어 트렌드는 요청에
시작일과 종료일을 받는데, 그 날짜를 타깃 params 에 넣으면 크론이 굳은 창을 영원히 재수집한다
(오늘 만든 타깃이 6개월 뒤에도 그때의 3개월치를 다시 모은다). 그래서 params 는 기간 이름만
갖고, 실제 창은 수집 시점에 계산한다.
"""

from __future__ import annotations

from enum import Enum

# 제품 수준 소스 식별자. AI 도구의 소스 설정 key 와 카탈로그가 같은 문자열을 쓴다.
SOURCE_ID = "NAVER_SEARCH_TREND"


class Period(str, Enum):
    """수집기간(일간/주간/월간)."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class TimeUnit(str, Enum):
    """데이터랩 집계 단위."""

    DATE = "date"
    WEEK = "week"
    MONTH = "month"


# 수집기간 → 벤더 집계 단위.
TIME_UNIT_FOR: dict[Period, TimeUnit] = {
    Period.DAILY: TimeUnit.DATE,
    Period.WEEKLY: TimeUnit.WEEK,
    Period.MONTHLY: TimeUnit.MONTH,
}

# 수집기간 → 조회할 창의 길이(일). 벤더가 이 창 안에서 최댓값을 100 으로 잡아 비율을 준다.
#   창이 곧 비교 기준이므로 기간마다 다르게 잡는다(일간은 최근 흐름, 월간은 계절성).
WINDOW_DAYS: dict[Period, int] = {
    Period.DAILY: 30,
    Period.WEEKLY: 7 * 12,
    Period.MONTHLY: 365,
}

# 기간별 유지할 데이터 포인트 수. 위 창은 양 끝이 걸쳐 항상 이보다 한 점을 더 주므로(실측: 일간
#   31점, 월간 13점) 여기서 최신 쪽만 남긴다. 진행률의 분모이기도 하다.
KEEP_COUNT: dict[Period, int] = {
    Period.DAILY: 30,
    Period.WEEKLY: 12,
    Period.MONTHLY: 12,
}

# 키워드 최대 길이. 키워드가 곧 타깃 키라 길이를 열어 두면 키가 무한정 길어진다.
KEYWORD_MAX_LENGTH = 100
