"""스위퍼(reconcile_stale): 콜백 유실/워커 사망 복구.

이 스위퍼의 판정은 되돌릴 수 없다: FAILED 로 찍으면 apply_callback 의 단조 전이 보호가 이후의
진짜 COMPLETED 콜백을 무시한다. 그래서 "죽었다"를 나이로 추측하면 안 된다. 오래 PENDING 인 건
앞에 밀려서일 수 있고(워커 슬롯 한정 + 그 뒤 GPU 는 staging/prod 공유), 그걸 실패로 단정하면 워커가
GPU 를 다 쓰고 결과 파일까지 저장한 작업이 영영 FAILED 로 남아 결과물이 고아가 된다.

권위는 큐다. 아래는 "나이는 후보만 고르고, 판정은 큐가 한다"를 고정한다.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.domains.video.adapters.outbound.checkpoint.redis_checkpoint import NullSceneCheckpoint
from app.domains.video.core.application.services import VideoJobService
from app.domains.video.core.domain.entities import VideoJob
from app.domains.video.core.domain.types import VideoJobStatus, VideoJobType


def _job(
    job_id: str,
    status: VideoJobStatus,
    job_type: VideoJobType = VideoJobType.TRANSCODE,
    attempts: int = 0,
) -> VideoJob:
    old = datetime.now(timezone.utc) - timedelta(hours=1)
    return VideoJob(
        id=job_id,
        type=job_type,
        status=status,
        attempts=attempts,
        created_at=old,
        updated_at=old,
    )


class _FakeRepo:
    """find_stale 이 나이 조건으로 이미 고른 후보를 그대로 돌려주는 가짜."""

    def __init__(self, stale: list[VideoJob]) -> None:
        self._stale = stale
        self.saved: list[VideoJob] = []

    async def save(self, job: VideoJob) -> VideoJob:
        self.saved.append(job)
        return job

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        return next((j for j in self._stale if j.id == job_id), None)

    async def find_stale(self, pending_before, processing_before) -> list[VideoJob]:  # noqa: ANN001
        return list(self._stale)

    async def count_active(self) -> int:
        return sum(
            1
            for j in self._stale
            if j.status in (VideoJobStatus.PENDING, VideoJobStatus.PROCESSING)
        )


class _FakeQueue:
    def __init__(self, alive_ids: set[str], worker_alive: bool = True) -> None:
        self._alive = alive_ids
        self._worker_alive = worker_alive
        self.asked: list[str] = []
        self.requeued: list[str] = []

    async def enqueue(self, job: VideoJob) -> None:
        pass

    async def requeue(self, job: VideoJob) -> None:
        self.requeued.append(job.id)

    async def is_alive(self, job_id: str) -> bool:
        self.asked.append(job_id)
        return job_id in self._alive

    async def worker_alive(self) -> bool:
        return self._worker_alive


async def test_queued_job_is_not_failed_however_old_it_is() -> None:
    # 큐에서 차례를 기다리는 중 = 느린 것이지 죽은 게 아니다. 공유 GPU 앞에서는 정상 상황이다.
    waiting = _job("waiting", VideoJobStatus.PENDING)
    repo, queue = _FakeRepo([waiting]), _FakeQueue({"waiting"})

    failed = await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 1800)

    assert failed == 0
    assert repo.saved == []                  # 건드리지 않는다(되돌릴 수 없는 판정이므로)
    assert waiting.status is VideoJobStatus.PENDING
    assert queue.asked == ["waiting"]        # 나이로 단정하지 않고 큐에 물었다


async def test_processing_job_still_running_is_not_failed() -> None:
    # PROCESSING 도 같다. 워커가 붙잡고 렌더 중이면(공유 ComfyUI 대기 포함) 살아 있는 것이다.
    rendering = _job("rendering", VideoJobStatus.PROCESSING)
    repo, queue = _FakeRepo([rendering]), _FakeQueue({"rendering"})

    assert await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 1800) == 0
    assert rendering.status is VideoJobStatus.PROCESSING


async def test_job_gone_from_queue_is_failed() -> None:
    # 큐를 떠났는데 아직 PENDING/PROCESSING = 콜백 유실 또는 워커 사망. 이게 스위퍼의 존재 이유다.
    lost = _job("lost", VideoJobStatus.PENDING)
    repo, queue = _FakeRepo([lost]), _FakeQueue(set())

    failed = await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 1800)

    assert failed == 1
    assert lost.status is VideoJobStatus.FAILED
    assert lost.error and "callback lost or worker died" in lost.error
    assert repo.saved == [lost]


async def test_only_dead_jobs_are_failed_when_mixed() -> None:
    # 후보가 섞여 있어도 큐 상태로만 가른다.
    alive, dead = _job("alive", VideoJobStatus.PENDING), _job("dead", VideoJobStatus.PROCESSING)
    repo, queue = _FakeRepo([alive, dead]), _FakeQueue({"alive"})

    assert await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 1800) == 1
    assert alive.status is VideoJobStatus.PENDING
    assert dead.status is VideoJobStatus.FAILED
    assert [j.id for j in repo.saved] == ["dead"]


async def test_dead_compose_job_is_requeued_not_failed() -> None:
    # 재개 가능한 COMPOSE 가 죽으면 실패시키지 말고 부활(재큐잉): 새 워커가 체크포인트로 이어서 한다.
    dead = _job("compose", VideoJobStatus.PROCESSING, VideoJobType.COMPOSE, attempts=0)
    repo, queue = _FakeRepo([dead]), _FakeQueue(set())  # 큐를 떠남(죽음)

    assert await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 300) == 1
    assert dead.status is VideoJobStatus.PENDING      # 실패가 아니라 재대기
    assert dead.attempts == 1                          # 재큐잉 카운터 증가
    assert dead.error is None
    assert queue.requeued == ["compose"]               # 다시 큐에 태움
    assert repo.saved == [dead]


async def test_compose_job_fails_after_resume_cap() -> None:
    # 재큐잉을 반복해도 계속 죽으면(재현 에러 등) 상한 초과 시 실패 확정: 무한 부활 방지.
    from app.domains.video.core.domain.retry_policy import RENDER_RETRY_POLICY

    exhausted = _job("c", VideoJobStatus.PROCESSING, VideoJobType.COMPOSE, attempts=RENDER_RETRY_POLICY.max_resume_attempts)
    repo, queue = _FakeRepo([exhausted]), _FakeQueue(set())

    assert await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 300) == 1
    assert exhausted.status is VideoJobStatus.FAILED
    assert queue.requeued == []
async def test_requeue_preserves_the_last_failure_cause() -> None:
    """재큐잉이 워커가 남긴 실패 원인을 지우지 않는다.

    지우면 재큐잉마다 원인이 사라져, 상한에서 실패가 확정될 때 왜 가 남지 않는다. 벤더 메시지를
    잃은 렌더는 만드는중으로 며칠씩 남는다.
    """
    dead = _job("compose", VideoJobStatus.PROCESSING, VideoJobType.COMPOSE, attempts=0)
    dead.error = "xAI 영상 생성 실패(failed): Temporarily unable to store the generated file."
    repo, queue = _FakeRepo([dead]), _FakeQueue(set())

    await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 300)

    assert dead.status is VideoJobStatus.PENDING
    assert dead.error and "xAI" in dead.error, "재큐잉이 원인을 지웠다"


async def test_final_failure_keeps_the_cause_and_adds_context() -> None:
    """상한 초과로 확정할 때도 원인을 보존하고 정황만 덧붙인다(스위퍼 문구로 덮지 않는다)."""
    from app.domains.video.core.domain.retry_policy import RENDER_RETRY_POLICY

    exhausted = _job("c", VideoJobStatus.PROCESSING, VideoJobType.COMPOSE, attempts=RENDER_RETRY_POLICY.max_resume_attempts)
    exhausted.error = "xAI 영상 생성 실패(failed): Temporarily unable to store the generated file."
    repo, queue = _FakeRepo([exhausted]), _FakeQueue(set())

    await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 300)

    assert exhausted.status is VideoJobStatus.FAILED
    assert "xAI" in exhausted.error            # 진짜 이유
    assert "reconciliation timeout" in exhausted.error  # 정황(스위퍼가 확정했다는 사실)


async def test_rate_limited_job_gets_one_more_try() -> None:
    """한도(429)는 시점의 문제일 수 있다. 재큐잉 간격이 분당 창을 넘기므로 한 번은 다시 돌려 본다."""
    throttled = _job("c", VideoJobStatus.PROCESSING, VideoJobType.COMPOSE, attempts=0)
    throttled.error = "Gemini 요청 한도 초과(429): quota"
    throttled.error_code = "rate_limited"
    repo, queue = _FakeRepo([throttled]), _FakeQueue(set())

    await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 300)

    assert throttled.status is VideoJobStatus.PENDING
    assert queue.requeued == ["c"]
    assert throttled.error_code == "rate_limited", "재큐잉이 코드를 지우면 되풀이를 알아볼 수 없다"


async def test_repeated_rate_limit_is_confirmed_as_quota_exceeded() -> None:
    """재큐잉 뒤에도 같은 한도면 그날 안에 풀리지 않는 한도다. 남은 예산을 쓰지 않고 확정한다.

    안 그러면 여덟 번을 더 돌리는 40분 동안 화면은 '만드는 중' 이고 답은 같다(실제로 Gemini 일일
    한도가 그렇게 두 렌더를 50분씩 붙잡았다). 코드는 소비자가 알림을 가르는 값이라 함께 바꾼다.
    """
    exhausted = _job("c", VideoJobStatus.PROCESSING, VideoJobType.COMPOSE, attempts=1)
    exhausted.error = "Gemini 요청 한도 초과(429): quota"
    exhausted.error_code = "rate_limited"
    repo, queue = _FakeRepo([exhausted]), _FakeQueue(set())

    assert await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 300) == 1

    assert exhausted.status is VideoJobStatus.FAILED
    assert queue.requeued == []
    assert exhausted.error_code == "quota_exceeded"
    assert "한도" in exhausted.error and "Gemini" in exhausted.error, "사람 문장 뒤에 벤더 원문이 남아야 한다"


async def test_other_failures_keep_the_full_resume_budget() -> None:
    """한도가 아닌 실패는 예산을 줄이지 않는다. 그쪽은 재시도가 실제로 통과하는 부류다."""
    flaky = _job("c", VideoJobStatus.PROCESSING, VideoJobType.COMPOSE, attempts=1)
    flaky.error = "xAI 호출이 실패했습니다(503): busy"
    repo, queue = _FakeRepo([flaky]), _FakeQueue(set())

    await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 300)

    assert flaky.status is VideoJobStatus.PENDING
    assert queue.requeued == ["c"]


async def test_final_failure_without_cause_still_explains_itself() -> None:
    """워커가 원인을 못 남긴 경우(워커 사망 등)는 정황만이라도 남는다."""
    from app.domains.video.core.domain.retry_policy import RENDER_RETRY_POLICY

    silent = _job("c", VideoJobStatus.PROCESSING, VideoJobType.COMPOSE, attempts=RENDER_RETRY_POLICY.max_resume_attempts)
    repo, queue = _FakeRepo([silent]), _FakeQueue(set())

    await VideoJobService(repo, queue, NullSceneCheckpoint()).reconcile_stale(300, 300)

    assert silent.error == "reconciliation timeout (callback lost or worker died)"
