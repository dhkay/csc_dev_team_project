"""카탈로그 엔티티: 어떤 소스가 있고 각 소스로 무엇을 수집할 수 있는가.

이 도메인이 존재하는 이유: 수집에 관한 지식은 수집기만 가진다. 분야 cid 와 기간별 보관 수와
소스별 수집 가능 여부를 소비자가 들고 있으면 아무도 검증하지 않는 값이 화면에서 수집 요청까지
그대로 흘러간다. 잘못된 cid 는 빈 응답을 만들고 그것이 영구 수집 중으로 굳는다.
선택지를 수집기가 주고 수집기가 검증한다.
"""

from __future__ import annotations

from dataclasses import dataclass

from .types import SourceStatus


@dataclass(frozen=True)
class RefreshPolicy:
    """이 소스를 얼마나 자주 다시 모을 수 있는가.

    쿼터가 소스마다 다르기 때문에 정책도 소스가 정한다. 전역 30분 TTL + 매시 크론을 모든
    소스에 그대로 적용하면 쿼터가 좁은 소스는 타깃 하나로 한도가 끝난다(SerpApi 무료 월 100회,
    YouTube search 는 하루 100회분). 그 소진은 조용하다: 업스트림이 429/403 을 주면 수집이 빈
    결과가 되고, 커널은 빈 결과를 덮어쓰지 않으므로 데이터만 낡는다.

    auto=False 면 크론 재수집 대상에서 빠진다. 즉 조회가 있을 때만 모은다(그때도 TTL 이 지나야
    한다). 아무도 안 보는 타깃에 쿼터를 쓰지 않는다.
    """

    ttl_seconds: int
    auto: bool


# 정책을 정하지 않은 소스에 쓰는 값. 쿼터 없는 소스의 현행(쇼핑인사이트) 기준이다.
DEFAULT_REFRESH = RefreshPolicy(ttl_seconds=30 * 60, auto=True)


@dataclass(frozen=True)
class SourceDescriptor:
    """소스 1개의 서술. 수집 구현이 없는(planned) 소스도 서술자는 가진다."""

    id: str  # 제품 수준 식별자. AI 도구의 소스 설정 key 와 같은 값
    label: str
    description: str
    status: SourceStatus
    # 수집 정책. planned 소스는 모으지 않으므로 None 이고, available 소스는 반드시 정한다
    #   (카탈로그 서비스가 조립 시점에 강제한다). 기본값을 주면 쿼터 좁은 소스가 실수로
    #   30분 TTL + 매시 크론을 물려받아 조용히 한도를 태운다.
    refresh: RefreshPolicy | None = None


@dataclass(frozen=True)
class CategoryOption:
    """목록에서 고르는 고정 선택지 1개(쇼핑 분야, 지역, 언어 등).

    value 는 벤더 식별자이고 소비자에게는 불투명하다. 소스마다 이 값이 들어가는 쿼리
    파라미터 이름이 다르므로(분야는 `cid`, 지역은 `geo`), 그 이름은 각 소스의 라우트가 문서에
    적는다.
    """

    value: str
    label: str


@dataclass(frozen=True)
class PeriodOption:
    """수집 기간 1개.

    expected = 이 기간에 수집기가 유지하는 데이터 포인트 수. 진행률의 분모라서
    소비자가 이 숫자를 복제하지 않도록 카탈로그가 알려준다.
    """

    value: str
    label: str
    expected: int


@dataclass(frozen=True)
class InputOption:
    """자유 입력 파라미터 1개. 고정 선택지가 없는 소스가 무엇을 받는지 서술한다.

    분야, 기간처럼 목록으로 고르는 축이 아니라 사람이 직접 써 넣는 값(키워드, 문서 제목)이다.
    이 축이 없으면 "이 소스는 키워드가 필요하다"를 소비자가 자기 코드에 상수로 갖게 되고,
    그것이 분야 cid 12개를 프론트가 베껴 두던 문제와 같은 유형이다.
    """

    name: str  # 수집 요청의 쿼리 파라미터 이름
    label: str
    required: bool
    max_length: int
    example: str


@dataclass(frozen=True)
class SourceOptions:
    """그 소스로 수집할 때 고를 수 있는 것. 비어 있는 축은 그 소스에 해당 개념이 없다는 뜻."""

    source_id: str
    categories: tuple[CategoryOption, ...] = ()
    periods: tuple[PeriodOption, ...] = ()
    inputs: tuple[InputOption, ...] = ()
