"""수집 도메인 타입: 값 객체와 결과 타입.

엔벨로프 자체(LogEnvelope / LogKind / LogScope …)는 공유 계약 패키지 `csc_log_contracts` 가
소유한다. 여기에는 수집 파이프라인에만 의미 있는 타입만 둔다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class RejectReason(str, Enum):
    """엔벨로프가 거부된 이유: 관측 가능해야 조용한 유실을 막는다."""

    INVALID_ENVELOPE = "INVALID_ENVELOPE"  # 불변식 위반 (스코프/주체 누락 등)
    MALFORMED = "MALFORMED"                # 역직렬화 실패
    SINK_FAILED = "SINK_FAILED"            # 저장소 적재 실패 (재시도 소진)


@dataclass(frozen=True)
class RejectedRecord:
    """거부된 레코드 1건: DLQ 페이로드이자 수집 응답의 개별 사유."""

    reason: RejectReason
    detail: str
    #: 원본 바이트/dict 를 그대로 보존한다. 파싱조차 실패한 경우가 있어 엔벨로프로 못 담는다.
    raw: str


@dataclass(frozen=True)
class IngestReceipt:
    """수집 배치 처리 결과.

    수집은 부분 성공을 허용한다. 배치 안의 잘못된 레코드 하나 때문에 나머지 정상 로그를
    버리면, 장애 상황에서 정작 필요한 로그가 사라진다. 거부 건은 사유와 함께 돌려준다.
    """

    accepted: int = 0
    rejected: list[RejectedRecord] = field(default_factory=list)

    @property
    def rejected_count(self) -> int:
        return len(self.rejected)
