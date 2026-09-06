"""조회 창 계산: 기간 이름 → (시작일, 종료일).

타깃에 절대 날짜를 저장하지 않으므로(types.py 참고) 창은 수집 시점에 만든다. 그 계산이
core 에 있는 이유는 순수 함수라 테스트가 쉽고, 어댑터가 바뀌어도 창의 의미는 그대로여야 하기
때문이다.

종료일을 어제로 잡는다. 오늘 데이터는 아직 집계 중이라 마지막 점이 늘 낮게 찍히고, 그 점만 보고
"검색량이 급감했다"고 읽는 사고가 난다.
"""

from __future__ import annotations

from datetime import date, timedelta

from .types import WINDOW_DAYS, Period


def resolve_window(period: Period, today: date) -> tuple[str, str]:
    end = today - timedelta(days=1)
    start = end - timedelta(days=WINDOW_DAYS[period])
    return start.isoformat(), end.isoformat()
