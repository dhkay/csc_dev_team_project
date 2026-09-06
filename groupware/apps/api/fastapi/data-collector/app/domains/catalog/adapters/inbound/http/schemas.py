"""카탈로그 요청/응답 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from ....core.domain.types import SourceStatus


class SourceSchema(BaseModel):
    id: str = Field(
        description=(
            "소스를 가리키는 고정 값. 수집 요청과 조직별 활성 설정에서 같은 값을 사용한다."
        )
    )
    label: str = Field(
        description="화면에 그대로 표시하는 이름(예: 네이버 쇼핑인사이트)."
    )
    description: str = Field(description="무엇을 모으는 소스인지 한 줄 설명.")
    status: SourceStatus = Field(
        description="`available` 은 현재 사용할 수 있는 소스, `planned` 은 아직 연동하지 않은 소스다."
    )


class CategoryOptionSchema(BaseModel):
    value: str = Field(
        description=(
            "수집을 요청할 때 넣는 값. 벤더가 정한 코드이므로 해석하지 않고 그대로 전달한다."
            " 이 값이 들어가는 파라미터 이름은 소스마다 다르며 그 소스의 조회 엔드포인트 문서에 있다."
        )
    )
    label: str = Field(description="화면에 표시하는 이름(예: 화장품/미용, 대한민국).")


class PeriodOptionSchema(BaseModel):
    value: str = Field(description="수집을 요청할 때 넣는 값(`period`). 예: `daily`.")
    label: str = Field(description="화면에 표시하는 이름(예: 일간).")
    expected: int = Field(
        description="이 기간의 수집이 완료됐을 때의 개수(예: 일간이면 12일치). 진행률의 분모로 사용한다."
    )


class InputOptionSchema(BaseModel):
    """고정 선택지 없이 직접 써 넣는 값(키워드, 문서 제목 등)."""

    name: str = Field(
        description="수집을 요청할 때 넣는 쿼리 파라미터 이름(예: `keyword`)."
    )
    label: str = Field(description="화면에 표시하는 입력 이름(예: 키워드).")
    required: bool = Field(description="비우고 요청하면 400 이 되는 값인가.")
    maxLength: int = Field(description="이 값의 최대 길이. 넘기면 400 이 된다.")
    example: str = Field(description="그대로 넣어 볼 수 있는 예시 값.")


class SourceOptionsSchema(BaseModel):
    """소스별로 선택할 수 있는 항목. 그 소스에 없는 축은 빈 배열로 반환된다."""

    sourceId: str = Field(description="어떤 소스의 선택지인지.")
    categories: list[CategoryOptionSchema] = Field(
        default=[], description="선택 가능한 분야 목록."
    )
    periods: list[PeriodOptionSchema] = Field(
        default=[], description="선택 가능한 기간 목록."
    )
    inputs: list[InputOptionSchema] = Field(
        default=[],
        description=(
            "직접 입력해야 하는 값 목록. 목록에서 고르는 것이 아니라 사람이 써 넣는 값이다."
            " 비어 있으면 그 소스는 입력값 없이 분야와 기간만으로 수집한다."
        ),
    )
