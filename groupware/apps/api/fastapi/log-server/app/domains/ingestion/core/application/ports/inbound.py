"""Inbound Port: 수집 서비스 호출 계약. Protocol 로 선언.

두 개의 구동 어댑터가 이 포트를 호출한다:
- HTTP 라우터 (`POST /logs`): 프로듀서가 보낸 배치를 버퍼에 넣는다.
- Kafka 컨슈머 (`worker.py`): 버퍼에서 꺼내 저장소에 적재한다.
"""

from __future__ import annotations

from typing import Protocol

from csc_log_contracts import LogEnvelope

from ...domain.types import IngestReceipt


class LogIngestionInboundPort(Protocol):
    """수집(버퍼 투입): HTTP 라우터가 호출."""

    async def accept(self, envelopes: list[LogEnvelope]) -> IngestReceipt:
        """엔벨로프 배치를 검증해 버퍼(Kafka)에 넣는다.

        부분 성공을 허용한다. 잘못된 레코드는 거부 사유와 함께 영수증에 담고,
        나머지 정상 로그는 통과시킨다.
        """
        ...


class LogSinkInboundPort(Protocol):
    """적재(버퍼 → 저장소): Kafka 컨슈머가 호출."""

    async def persist(self, payloads: list[bytes], source_topic: str) -> IngestReceipt:
        """Kafka 원본 바이트 배치를 디코드/검증해 저장소에 적재한다.

        실패 건은 DLQ 로 보낸 뒤 영수증에 담는다. 호출자(컨슈머)는 영수증을 받은 뒤에만
        오프셋을 커밋한다. 예외가 나가면 커밋하지 않아 재처리된다.
        """
        ...
