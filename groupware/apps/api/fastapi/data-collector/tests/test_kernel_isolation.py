"""수집 커널이 소스 도메인을 모른다는 불변식.

의존 방향은 한쪽이어야 한다: 소스 → 커널. 반대로 새면 "새 소스 = 플러그인 1개 + 레지스트리 한 줄"
이라는 주장이 조용히 거짓이 된다(예전 포트 주석이 정확히 그렇게 거짓말을 하고 있었다).
주석이 아니라 테스트로 고정한다.
"""

from __future__ import annotations

import re
from pathlib import Path

DOMAINS = Path(__file__).resolve().parents[1] / "app" / "domains"
KERNEL = DOMAINS / "collection"


def _other_domains() -> list[str]:
    """커널을 뺀 모든 도메인. 목록을 손으로 적지 않는다.

    도메인 이름을 상수로 박아 두면 소스가 늘어도 그 목록은 늘지 않아 새 소스가 이 불변식의
    보호를 받지 못한다. 그러면 테스트는 통과하면서 주장만 거짓이 된다.
    """
    return sorted(p.parent.name for p in DOMAINS.glob("*/module.py") if p.parent.name != "collection")


def test_kernel_does_not_import_any_source_domain() -> None:
    offenders: list[str] = []
    others = _other_domains()
    assert others, "도메인 탐색 실패(경로 규칙이 바뀌었는지 확인한다)"
    for path in KERNEL.rglob("*.py"):
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        for name in others:
            # 절대(app.domains.x) 와 상대(from ...x, from ....x) 양쪽을 본다.
            if re.search(rf"domains\.{name}\b|from \.{{2,}}{name}\.", text):
                offenders.append(f"{path.name}: {name}")
    assert offenders == [], f"커널이 소스 도메인을 import 한다: {offenders}"


def test_worker_function_names_match_the_enqueue_contract() -> None:
    """enqueue 하는 이름과 워커가 등록한 코루틴 이름이 어긋나면 잡이 조용히 죽는다.

    레포에 같은 유형의 사고 기록이 있다(function not found → 버킷 영구 미수집).
    구 이름 shim 은 다음 릴리스에서 이 단언과 함께 삭제한다.
    """
    from app.domains.collection.adapters.outbound.queue.arq_queue import (
        LEGACY_WORKER_FUNCTION,
        WORKER_FUNCTION,
    )
    from app.worker import WorkerSettings

    registered = {fn.__name__ for fn in WorkerSettings.functions}
    assert {WORKER_FUNCTION, LEGACY_WORKER_FUNCTION} <= registered
