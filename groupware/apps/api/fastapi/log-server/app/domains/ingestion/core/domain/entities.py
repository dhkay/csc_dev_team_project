"""수집 도메인 엔티티.

핵심 엔티티인 `LogEnvelope` 는 공유 계약 패키지(`csc_log_contracts`)가 소유한다
프로듀서(다른 서비스)와 컨슈머(이 서버)가 같은 정의를 봐야 하기 때문이다.
여기에는 수집 서버 안에서만 존재하는 엔티티를 둔다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from .types import RejectedRecord


@dataclass(frozen=True)
class DeadLetter:
    """DLQ 레코드: 왜, 언제, 어느 토픽에서 죽었는지.

    원본을 그대로 보존해 수정 후 재생(replay)할 수 있게 한다. 로그 파이프라인이
    조용히 데이터를 버리지 않는다는 보장은 이 엔티티가 존재하는지에 달려 있다.
    """

    record: RejectedRecord
    source_topic: str
    failed_at: datetime

    @staticmethod
    def now(record: RejectedRecord, source_topic: str) -> DeadLetter:
        return DeadLetter(
            record=record,
            source_topic=source_topic,
            failed_at=datetime.now(timezone.utc),
        )
