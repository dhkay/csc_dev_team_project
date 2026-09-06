"""DB 커넥션 풀 복원력.

이 설정은 평소엔 아무 티가 안 나다가 DB 가 재시작한 뒤 첫 요청이나 첫 잡에서만 드러난다.
리팩토링 중에 조용히 빠져도 아무도 모르므로 테스트로 고정한다.

실패 모양은 이렇다. 워커가 유휴 상태로 있는 동안 db 컨테이너가 재시작하면 다음 잡이 죽은
커넥션을 그대로 꺼내 써서 `InterfaceError: connection is closed` 로 죽는다. mark_attempted 가
첫 쓰기라 시도했음조차 남지 않아, 그 타깃은 실패가 아니라 계속 collecting 으로 보인다.
"""

from __future__ import annotations

import pytest

from app.container import _engine as api_engine
from app.worker import _engine as worker_engine


@pytest.mark.parametrize(
    ("name", "engine"),
    [("api", api_engine), ("worker", worker_engine)],
)
def test_engine_checks_connections_before_handing_them_out(name: str, engine) -> None:  # noqa: ANN001
    """pre_ping 이 꺼져 있으면 죽은 커넥션이 그대로 나가서 그 요청/잡이 실패한다."""
    assert engine.pool._pre_ping is True, f"{name} 엔진에 pool_pre_ping 이 꺼져 있다"


@pytest.mark.parametrize(
    ("name", "engine"),
    [("api", api_engine), ("worker", worker_engine)],
)
def test_engine_recycles_idle_connections(name: str, engine) -> None:  # noqa: ANN001
    """무한 유지(-1)면 pgbouncer/클라우드 PG 의 idle timeout 이 먼저 끊어 간다."""
    recycle = engine.pool._recycle
    assert 0 < recycle <= 3600, f"{name} 엔진의 pool_recycle 이 {recycle} (유휴 교체 없음)"
