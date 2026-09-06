"""워커의 실패 보고 시점: 재시도가 실제로 성공할 수 있어야 한다.

상태 기록은 단조적이다(apply_callback: COMPLETED/FAILED 이후 콜백 무시). 따라서 중간 시도의 실패를
보고해 버리면 작업이 종료 상태로 못박혀, 이후 재시도가 성공해도 그 COMPLETED 는 버려진다. 재시도는
GPU 만 쓰고 결과를 반영할 수 없는 헛수고가 된다(공유 GPU 에선 남의 작업까지 밀어낸다).
그래서 실패 확정은 마지막 시도에서만 한다.
"""

from __future__ import annotations

import pytest

from app.domains.video.core.application.worker_service import VideoWorkerService
from app.domains.video.core.domain.types import ProcessedResult, VideoJobStatus, VideoJobType


class _Files:
    async def download_source(self, file_id: str, dest_path: str) -> None:
        pass

    async def store_result(self, job_id, file_name, mime_type, src_path, organization_id=None) -> str:  # noqa: ANN001
        return "result-file-id"


class _Processing:
    """지정한 횟수만큼 실패한 뒤 성공하는 가짜(일시적 장애 재현)."""

    def __init__(self, fail_times: int) -> None:
        self._left = fail_times
        self.calls = 0

    async def process(self, type, params, source_path, out_dir) -> ProcessedResult:  # noqa: ANN001
        self.calls += 1
        if self._left > 0:
            self._left -= 1
            raise RuntimeError("ComfyUI 큐 대기 초과(다른 작업이 밀려 있음)")
        return ProcessedResult(path=f"{out_dir}/out.mp4", file_name="out.mp4", mime_type="video/mp4")


class _Callback:
    def __init__(self) -> None:
        self.sent: list[tuple[str, VideoJobStatus]] = []
        self.errors: list[str | None] = []
        self.codes: list[str | None] = []

    async def callback(
        self,
        job_id,
        status,
        result_file_id=None,
        error=None,
        captions_file_id=None,
        usage=None,
        scene_states=None,
        error_code=None,
    ) -> None:  # noqa: ANN001
        self.sent.append((job_id, status))
        self.errors.append(error)
        self.codes.append(error_code)


def _svc(processing: _Processing, cb: _Callback) -> VideoWorkerService:
    return VideoWorkerService(files=_Files(), processing=processing, callback=cb)


async def _run(svc: VideoWorkerService, cb: _Callback) -> bool:
    """1회 시도. 실패(재던짐)면 False."""
    try:
        await svc.run(
            job_id="j1",
            type=VideoJobType.TRANSCODE,
            params={},
            source_file_id=None,
        )
        return True
    except RuntimeError:
        return False


async def test_intermediate_failure_is_not_reported_so_retry_can_still_succeed() -> None:
    cb = _Callback()
    svc = _svc(_Processing(fail_times=1), cb)

    assert await _run(svc, cb) is False   # 1차 시도 실패 → 재던짐(큐가 재시도)
    assert VideoJobStatus.FAILED not in [s for _, s in cb.sent], "중간 실패를 보고하면 작업이 못박힌다"

    assert await _run(svc, cb) is True     # 2차 시도 성공
    assert cb.sent[-1] == ("j1", VideoJobStatus.COMPLETED)


async def test_transient_failure_is_not_finalized_by_the_worker() -> None:
    """일시적 실패의 종료 판정은 워커가 하지 않는다: 재시도 예산을 아는 스위퍼가 한다.

    워커가 여기서 FAILED 를 보내면 상태 기록이 단조적이라 이후 재시도의 성공 콜백이 무시된다
    (남은 재시도가 GPU/과금만 쓰고 결과를 반영하지 못한다).
    """
    cb = _Callback()
    svc = _svc(_Processing(fail_times=99), cb)

    assert await _run(svc, cb) is False
    assert VideoJobStatus.FAILED not in [st for _, st in cb.sent]


async def test_failure_is_always_reraised_so_the_queue_retries() -> None:
    cb = _Callback()
    svc = _svc(_Processing(fail_times=99), cb)
    with pytest.raises(RuntimeError):
        await svc.run(
            job_id="j1",
            type=VideoJobType.TRANSCODE,
            params={},
            source_file_id=None,
        )


async def test_intermediate_failure_still_records_the_cause() -> None:
    """아직 성공 가능한 실패는 종료로 못박지 않되 원인은 남긴다.

    원인을 남기지 않으면 스위퍼가 재큐잉을 반복하다 한도에서 '타임아웃' 으로 확정해, 벤더가 준
    이유(예: xAI 저장 실패)가 사라진다.
    """
    cb = _Callback()
    svc = _svc(_Processing(fail_times=99), cb)

    assert await _run(svc, cb) is False

    # 상태는 비종료(PROCESSING)로 유지: 남은 재시도가 아직 성공할 수 있다.
    assert cb.sent[-1] == ("j1", VideoJobStatus.PROCESSING)
    assert VideoJobStatus.FAILED not in [st for _, st in cb.sent]
    # 그러나 원인은 실려 있어야 한다.
    assert cb.errors[-1] and "ComfyUI" in cb.errors[-1]


async def test_success_clears_a_previously_recorded_cause() -> None:
    """재시도가 성공하면 남아 있던 실패 원인이 지워져야 한다(낡은 오류가 화면에 남지 않게)."""
    cb = _Callback()
    svc = _svc(_Processing(fail_times=1), cb)

    await _run(svc, cb)                   # 1차 실패 → 원인 기록
    assert cb.errors[-1] is not None

    assert await _run(svc, cb) is True     # 2차 성공
    assert cb.sent[-1] == ("j1", VideoJobStatus.COMPLETED)
    assert cb.errors[-1] is None
async def test_permanent_failure_is_finalized_immediately() -> None:
    """재시도가 무의미한 실패(입력 소실)는 즉시 FAILED 로 확정한다.

    이게 없으면 스위퍼가 열 번 부활시키는 동안 화면은 계속 '만드는중' 이고, 그때마다 같은 404 를
    받는다. 실제로 씬 이미지가 지워진 잡이 그렇게 이틀을 돌았다.
    """
    from app.domains.video.core.domain.errors import MissingRenderInputError

    class _GoneInput:
        async def process(self, type, params, source_path, out_dir):  # noqa: ANN001
            raise MissingRenderInputError("렌더 입력 파일을 찾을 수 없습니다(file_id=abc)")

    cb = _Callback()
    svc = VideoWorkerService(files=_Files(), processing=_GoneInput(), callback=cb)

    with pytest.raises(MissingRenderInputError):
        await svc.run(job_id="j1", type=VideoJobType.COMPOSE, params={}, source_file_id=None)

    assert cb.sent[-1] == ("j1", VideoJobStatus.FAILED)
    assert cb.errors[-1] and "찾을 수 없습니다" in cb.errors[-1]
    assert cb.codes[-1] == "input_missing"


async def test_failure_reason_code_rides_along_with_the_message() -> None:
    """실패 사유 코드는 문장과 함께 콜백에 실린다. 분류된 실패만 코드를 갖고, 나머지는 None.

    소비자가 문장으로 한도와 크레딧을 가르면 벤더 문구가 바뀌는 날 어긋난다. 그래서 코드가 따로 간다.
    """
    from app.domains.video.core.domain.errors import VendorRefusedError, VendorTransientError
    from app.domains.video.core.domain.render_failure import RenderFailure

    class _Throttled:
        async def process(self, type, params, source_path, out_dir):  # noqa: ANN001
            raise VendorTransientError("Gemini 요청 한도 초과(429): quota", failure=RenderFailure.RATE_LIMITED)

    class _Broke:
        async def process(self, type, params, source_path, out_dir):  # noqa: ANN001
            raise VendorRefusedError("Higgsfield가 요청을 거절했습니다(403): 크레딧", failure=RenderFailure.CREDIT_EXHAUSTED)

    throttled = _Callback()
    with pytest.raises(VendorTransientError):
        await VideoWorkerService(files=_Files(), processing=_Throttled(), callback=throttled).run(
            job_id="j1", type=VideoJobType.COMPOSE, params={}, source_file_id=None
        )
    # 한도는 일시 실패다: 비종료로 두고 코드만 남긴다(스위퍼가 되풀이를 보고 확정한다).
    assert throttled.sent[-1] == ("j1", VideoJobStatus.PROCESSING)
    assert throttled.codes[-1] == "rate_limited"

    broke = _Callback()
    with pytest.raises(VendorRefusedError):
        await VideoWorkerService(files=_Files(), processing=_Broke(), callback=broke).run(
            job_id="j1", type=VideoJobType.COMPOSE, params={}, source_file_id=None
        )
    assert broke.sent[-1] == ("j1", VideoJobStatus.FAILED)
    assert broke.codes[-1] == "credit_exhausted"

    # 분류되지 않은 실패(ComfyUI 대기 초과)는 코드가 없다. 없는 사유를 지어내지 않는다.
    plain = _Callback()
    await _run(_svc(_Processing(fail_times=1), plain), plain)
    assert plain.codes[-1] is None
