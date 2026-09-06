"""도메인 엔티티 (순수: httpx/FastAPI/SQLAlchemy import 없음)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RelatedKeyword:
    """씨앗 키워드에 연관된 검색어 한 건.

    검색량은 PC 와 모바일이 따로 온다. 합계만 남기면 "모바일에서만 검색되는 말"과 "양쪽에서
    고르게 검색되는 말"을 구분할 수 없어, 영상을 어느 화면 기준으로 만들지 판단할 근거가 사라진다.
    그래서 셋 다 나른다.

    competition 은 벤더가 주는 광고 경쟁 정도(높음/중간/낮음)다. 숫자가 아니라 등급이라 문자열
    그대로 나른다.
    """

    rank: int
    keyword: str
    monthly_searches: int
    pc_searches: int
    mobile_searches: int
    competition: str
