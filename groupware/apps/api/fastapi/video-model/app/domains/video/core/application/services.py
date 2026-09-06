"""Inbound Port 구현 = video-model API 비즈니스 로직 (오케스트레이션, SSoT).

외부(FastAPI/SQLAlchemy/arq)를 모르고 Outbound Port(Protocol)만 주입받는다.
video_jobs 의 유일 라이터: 상태 전이는 전부 이 서비스를 통한다.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from ..domain.entities import VideoJob
from ..domain.errors import DuplicateClientRequestError
from ..domain.render_failure import QUOTA_EXCEEDED_MESSAGE, RenderFailure
from ..domain.types import (
    RenderStage,
    RenderUsage,
    SceneProgress,
    SceneRenderStatus,
    SceneState,
    VideoJobStatus,
    VideoJobType,
)
from ..domain.retry_policy import RENDER_RETRY_POLICY
from .ports.outbound import JobQueuePort, SceneCheckpointPort, VideoJobRepositoryPort

_logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


_TERMINAL_STATUSES = (
    VideoJobStatus.COMPLETED,
    VideoJobStatus.FAILED,
    VideoJobStatus.CANCELED,
)


def _sorted_scenes(params: dict[str, Any]) -> list[dict[str, Any]]:
    """잡 params 의 씬을 order 순으로. 이 순서가 곧 영상의 순서다."""
    return sorted(params.get("scenes") or [], key=lambda s: int(s.get("order", 0)))


def _compose_scenes(
    params: dict[str, Any],
    *,
    checkpoint: dict[int, dict[str, Any]] | None = None,
    states: list[SceneState] | None = None,
) -> list[SceneProgress] | None:
    """COMPOSE 씬 목록(조회용). 씬 수를 모르면(빈 params) None.

    출처가 둘이다. 진행 중이면 체크포인트(살아 있는 값), 끝난 잡이면 저장된 씬 결과
    (체크포인트는 성공 시 지워진다). 둘을 같은 모양으로 내보내므로 보는 쪽은 잡이 끝났는지 몰라도 된다.
    둘 다 있으면 저장된 결과가 이긴다: 그쪽이 확정된 사실이다.
    """
    scenes = _sorted_scenes(params)
    if not scenes:
        return None
    saved_by_order = {s.order: s for s in (states or [])}
    ckpt = checkpoint or {}
    out: list[SceneProgress] = []
    for scene in scenes:
        order = int(scene.get("order", 0))
        saved = saved_by_order.get(order)
        entry = ckpt.get(order, {})
        clip_file_id = (saved.clip_file_id if saved else None) or entry.get("clip_file_id")
        if clip_file_id:
            status = SceneRenderStatus.DONE
        elif entry.get("prompt_id"):
            # 벤더에 보냈고 아직 안 돌아왔다. 클립이 없으므로 완료로 셀 수 없다.
            status = SceneRenderStatus.RUNNING
        else:
            status = SceneRenderStatus.WAITING
        out.append(
            SceneProgress(
                order=order,
                status=status,
                clip_file_id=clip_file_id,
                duration_sec=saved.duration_sec if saved else None,
                prompt=scene.get("visual_prompt") or None,
            )
        )
    return out


def _compose_progress(scenes: list[SceneProgress] | None) -> int | None:
    """COMPOSE 진행률(0~99). 완료 씬=1, 렌더 중=0.5 가중.

    씬 목록에서 파생한다(체크포인트를 따로 세지 않는다): 화면이 보는 칸과 진행률이 같은 값에서
    나오므로 둘이 어긋날 수 없다. 렌더 중엔 100 을 주지 않는다(100 은 상태가 COMPLETED 될 때).
    """
    if not scenes:
        return None
    done = sum(1 for s in scenes if s.status is SceneRenderStatus.DONE)
    inflight = sum(1 for s in scenes if s.status is SceneRenderStatus.RUNNING)
    pct = round((done + 0.5 * inflight) / len(scenes) * 100)
    return max(0, min(99, pct))


def _render_stage(scenes: list[SceneProgress] | None) -> RenderStage | None:
    """지금 밟는 구간. 씬이 남았으면 SCENES, 다 만들었으면 FINALIZING(이어붙이기~업로드)."""
    if not scenes:
        return None
    if any(s.status is not SceneRenderStatus.DONE for s in scenes):
        return RenderStage.SCENES
    return RenderStage.FINALIZING


def _quota_exhausted(job: VideoJob) -> bool:
    """한도 실패가 재큐잉 예산을 다 쓰고도 되풀이됐는가. 참이면 일일 한도로 보고 확정한다.

    워커는 시도를 시작할 때 코드 없는 PROCESSING 콜백을 보내므로, 여기 남은 RATE_LIMITED 는
    마지막 시도가 실제로 한도에 걸렸다는 뜻이다(이전 시도의 잔상이 아니다).
    """
    return (
        job.error_code == RenderFailure.RATE_LIMITED.value
        and RENDER_RETRY_POLICY.rate_limit_persists(job.attempts)
    )


class VideoJobService:
    def __init__(
        self,
        repository: VideoJobRepositoryPort,
        queue: JobQueuePort,
        checkpoint: SceneCheckpointPort,
    ) -> None:
        self._repository = repository
        self._queue = queue
        self._checkpoint = checkpoint

    async def create_job(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_file_id: str | None = None,
        client_request_id: str | None = None,
    ) -> VideoJob:
        """잡을 등록한다. 멱등키가 있으면 같은 키의 잡을 두 번 만들지 않는다.

        이 서버가 판정하는 이유. 호출자가 재시도해도 안전하게 만들 수 있는 곳은 잡을 만드는 쪽뿐이다.
        호출자는 벤더 호출과 자기 진행 기록 사이에서 죽을 수 있고(그 폭은 DB 쓰기 한 번), 그때
        재실행이 두 번째 잡을 만들면 요금이 두 번 나가고 하나는 아무도 폴링하지 않는 고아가 된다.
        """
        if client_request_id:
            existing = await self._repository.find_by_client_request_id(client_request_id)
            if existing is not None:
                # 이미 만든 잡을 그대로 돌려준다(큐에도 다시 넣지 않는다: 워커가 이미 들고 있다).
                return existing
        now = _now()
        job = VideoJob(
            id=str(uuid.uuid4()),
            type=type,
            status=VideoJobStatus.PENDING,
            params=params,
            source_file_id=source_file_id,
            client_request_id=client_request_id,
            created_at=now,
            updated_at=now,
        )
        try:
            await self._repository.save(job)
        except DuplicateClientRequestError:
            # 사전 조회를 통과한 두 요청이 동시에 등록하면 하나는 부분 유니크에 걸린다. 그 실패는
            #   성공으로 접는다(재조회해서 이긴 잡을 돌려준다). 실패로 올리면 호출자에겐 실패로
            #   보이는데 잡은 이미 돌고 있어, 그 어긋남이 다시 호출하게 만든다.
            if not client_request_id:
                raise
            existing = await self._repository.find_by_client_request_id(client_request_id)
            if existing is None:
                raise
            return existing
        await self._queue.enqueue(job)  # Redis 는 전달만. 진실은 video_jobs
        return job

    async def get_job(self, job_id: str) -> VideoJob | None:
        job = await self._repository.find_by_id(job_id)
        if job is None:
            return None
        # 조회 시 파생값(비영속)을 채운다. 셋 다 저장하지 않는 이유는 같다: 지금 이 순간의 관측이라
        #   행에 남기면 다음 관측과 어긋난 채 굳는다.
        running = job.status in (VideoJobStatus.PENDING, VideoJobStatus.PROCESSING)
        if running:
            job.worker_alive = await self._queue.worker_alive()
        if job.type == VideoJobType.COMPOSE:
            # 씬 목록: 진행 중이면 체크포인트에서, 끝난 잡이면 저장된 씬 결과에서. 끝난 잡에 체크포인트를
            #   묻지 않는 이유는 거기 아무것도 없기 때문이다(성공 시 지워지고 하루면 만료된다).
            ckpt = await self._checkpoint.load(job_id) if running else {}
            job.scenes = _compose_scenes(
                job.params, checkpoint=ckpt, states=job.scene_states
            )
            if running:
                # 진행률과 구간은 위 목록에서 파생한다(따로 세지 않는다). 끝난 잡에는 채우지 않는다:
                #   그때 '마무리 중' 이라고 적으면 화면이 끝난 렌더를 진행 중으로 그린다.
                job.progress = _compose_progress(job.scenes)
                job.render_stage = _render_stage(job.scenes)
        return job

    async def apply_callback(
        self,
        job_id: str,
        status: VideoJobStatus,
        result_file_id: str | None = None,
        error: str | None = None,
        captions_file_id: str | None = None,
        usage: RenderUsage | None = None,
        scene_states: list[SceneState] | None = None,
        error_code: str | None = None,
    ) -> VideoJob:
        job = await self._repository.find_by_id(job_id)
        if job is None:
            raise LookupError(job_id)
        # 단조 전이 보호: 종료 상태 이후 콜백은 무시(멱등).
        #   CANCELED 를 반드시 포함한다. 취소와 경합한 워커 콜백(PROCESSING/COMPLETED)이 이 가드를
        #   빠져나가면 취소한 잡이 되살아나고, 사라진 프로젝트의 렌더 결과가 다시 확정된다.
        if job.status in _TERMINAL_STATUSES:
            return job
        job.status = status
        if result_file_id is not None:
            job.result_file_id = result_file_id
        if captions_file_id is not None:
            job.captions_file_id = captions_file_id
        if usage is not None:
            # progress/worker_alive 와 달리 영속한다. 체크포인트가 성공 시 지워지므로
            #   이 값을 저장하지 않으면 청구 근거가 영구히 사라진다(폴링 1회 유실로도).
            job.usage = usage
        if scene_states is not None:
            # 같은 이유로 영속한다. 이 값이 없으면 완료된 영상의 씬별 클립을 되살릴 수 없어
            #   세그먼트 격자도, 씬 하나만 다시 만들기도 성립하지 않는다.
            job.scene_states = scene_states
        # 문장과 코드는 한 쌍이다. 성공 콜백은 둘 다 None 으로 덮어 낡은 사유가 남지 않는다.
        job.error = error
        job.error_code = error_code
        job.updated_at = _now()
        return await self._repository.save(job)

    async def rerender_scene(
        self,
        job_id: str,
        order: int,
        visual_prompt: str | None = None,
    ) -> VideoJob | None:
        """씬 하나만 다시 만든다. 나머지 씬은 체크포인트에 남겨 두어 건너뛴다.

        완료된 잡은 체크포인트가 지워진 뒤다(성공 시 clear). 그대로 다시 태우면 워커가 이어서 할
        근거를 못 찾아 전 씬을 다시 만들고 전액 재과금된다. 그래서 잡 행의 scene_states 로
        체크포인트를 복원한 다음, 다시 만들 씬 하나만 버린다. 그 씬만 벤더에 다시 나간다.

        재개 중인 잡(PENDING/PROCESSING)에도 같은 절차가 성립한다. 복원은 이미 있는 값을 같은 값으로
        덮는 것이라(save_scene 은 부분 병합) 진행 중인 렌더를 흔들지 않는다.
        """
        job = await self._repository.find_by_id(job_id)
        if job is None:
            return None
        if job.type != VideoJobType.COMPOSE:
            raise ValueError("rerender_scene: COMPOSE 잡만 씬을 다시 만들 수 있습니다")
        scenes = _sorted_scenes(job.params)
        target = next((s for s in scenes if int(s.get("order", 0)) == order), None)
        if target is None:
            raise LookupError(f"{job_id}:scene:{order}")

        # 1. 저장된 씬 결과로 체크포인트를 되살린다(다시 만들 씬은 뺀다: 어차피 바로 아래에서 버린다).
        for state in job.scene_states or []:
            if state.order == order or not state.clip_file_id:
                continue
            await self._checkpoint.save_scene(
                job_id,
                state.order,
                clip_file_id=state.clip_file_id,
                billed_seconds=state.billed_seconds,
            )
        # 2. 대상 씬만 통째로 버린다(handle + 클립 + 청구 초). drop_scene_handle 로는 안 된다:
        #    그쪽은 완성 클립을 남기므로 워커가 그것을 재사용해 아무것도 다시 만들지 않는다.
        await self._checkpoint.drop_scene(job_id, order)

        if visual_prompt is not None:
            # 화면 묘사를 고쳐서 다시 만드는 경우. params 는 잡의 렌더 스펙이고 save 가 통째로 쓴다.
            target["visual_prompt"] = visual_prompt
            job.params = {**job.params, "scenes": scenes}

        # 3. 다시 큐에 태운다. 결과물은 전 씬을 이어붙여 새로 만들어지므로 이전 결과는 비운다.
        job.status = VideoJobStatus.PENDING
        job.result_file_id = None
        job.captions_file_id = None
        job.error = None
        job.error_code = None
        # 씬 결과는 지우지 않는다. 이 값이 재실행 중에도 세그먼트 격자의 유일한 근거이고, 성공하면
        #   완료 콜백이 새 값으로 덮는다. 여기서 비우면 다시 만드는 동안 화면의 칸이 전부 사라진다.
        # attempts 는 건드리지 않는다. 그 값은 스위퍼의 재큐잉 횟수이지 사용자 조작이 아니다.
        job.updated_at = _now()
        saved = await self._repository.save(job)
        await self._queue.requeue(job)
        return saved

    async def cancel_job(self, job_id: str) -> VideoJob | None:
        """진행 중 작업을 취소한다. 상태를 CANCELED 로 확정하고 큐에 중단을 요청한다(멱등).

        상태를 먼저 확정한다. 그러면 취소와 경합한 워커 콜백은 단조 전이 보호에 걸려 무시되고
        (apply_callback 이 종료 상태를 덮지 않는다), 스위퍼도 비종료가 아니라 되살리지 않는다.
        큐 중단은 그 뒤 best-effort: 신호가 못 가도 렌더가 한 번 헛돌 뿐 상태는 이미 확정이다.

        FAILED 가 아니라 CANCELED 인 이유: 원장에서 '실패' 와 '사용자가 그만둔 것' 은 다른 사실이다.
        (status 컬럼은 varchar 라 값 추가에 마이그레이션이 필요 없다.)
        """
        job = await self._repository.find_by_id(job_id)
        if job is None:
            return None
        if job.status in _TERMINAL_STATUSES:
            return job  # 이미 끝났다. 되돌리지 않는다(멱등).

        job.status = VideoJobStatus.CANCELED
        job.error = "canceled by requester"
        job.updated_at = _now()
        saved = await self._repository.save(job)

        await self._queue.abort(job_id)
        # 씬 체크포인트 정리: 남겨두면 재개 근거로 오해되고 redis 를 차지한다(취소는 재개 대상이 아니다).
        await self._checkpoint.clear(job_id)
        return saved

    async def reconcile_stale(
        self,
        pending_timeout_s: int,
        processing_timeout_s: int,
    ) -> int:
        """콜백 유실/워커 사망으로 멈춘 작업을 복구한다. 재개 가능한 잡은 부활(재큐잉), 아니면 실패.

        나이는 후보를 고를 뿐, 판정은 큐가 한다. 오래 PROCESSING 인 건 죽어서가 아니라 렌더가 길거나
        앞에 밀려서일 수 있다. 그래서 arq 에 "아직 살아 있나(is_alive)"를 직접 물어, 큐를 떠난
        (complete/not_found) 것만 죽은 것으로 본다. 살아있는(느린) 렌더는 나이와 무관하게 건드리지 않는다.

        죽은 잡 중 재개 가능한 COMPOSE 는 실패시키지 않고 다시 큐에 태운다: 새 워커가 씬 체크포인트로
        완료 씬을 건너뛰고 이어서 완성한다(GPU 재작업 최소). 워커가 graceful 종료돼 arq 가 '완료'로
        마킹했더라도, requeue 가 그 기록을 지우고 재실행시킨다 → 재시작/재배포에도 렌더가 안 끊긴다.
        재개 한도(재큐잉 반복 상한)를 넘기거나 재개 불가한 잡만 FAILED 로 확정한다.
        """
        now = _now()
        # 워커가 없는데 비종료 잡이 쌓여 있으면(예: pnpm dev 우회로 API 만 기동) 조용한 무한 RENDERING 이
        #   된다. 스위퍼 한 틱(≈sweeper_interval) 안에 loud 하게 알려 우회 실수를 스스로 드러낸다.
        if not await self._queue.worker_alive() and await self._repository.count_active() > 0:
            _logger.warning(
                "no arq worker consuming render jobs: jobs will hang. "
                "Run `pnpm dev` (co-launches the worker) or `uv run arq app.worker.WorkerSettings`."
            )
        stale = await self._repository.find_stale(
            pending_before=now - timedelta(seconds=pending_timeout_s),
            processing_before=now - timedelta(seconds=processing_timeout_s),
        )
        acted = 0
        for job in stale:
            if await self._queue.is_alive(job.id):
                continue  # 큐에서 대기/처리 중. 느린 것이지 죽은 게 아니다.
            quota_exhausted = _quota_exhausted(job)
            resumable = (
                job.type == VideoJobType.COMPOSE
                and job.attempts < RENDER_RETRY_POLICY.max_resume_attempts
                and not quota_exhausted
            )
            if resumable:
                # 재개 가능: 부활시켜 이어서 한다. attempts 는 재큐잉 횟수(무한 루프 방지 카운터).
                job.attempts += 1
                job.status = VideoJobStatus.PENDING
                # error 는 지우지 않는다. 워커가 남긴 마지막 실패 원인이 유일한 진단 근거다.
                #   여기서 None 으로 밀면 재큐잉마다 원인이 사라져, 실패가 확정될 때 "왜" 가 남지 않는다.
                #   성공하면 COMPLETED 콜백이 error=None 으로 덮으므로 오래된 값이 남지 않는다.
                job.updated_at = now
                await self._repository.save(job)
                await self._queue.requeue(job)
            elif quota_exhausted:
                # 한도가 재큐잉 뒤에도 그대로다: 일일 한도로 확정한다. 사람 문장을 앞에, 벤더 원문을
                #   뒤에 남긴다(원문이 없으면 어느 벤더의 어떤 한도였는지 다시 추적할 수 없다).
                job.status = VideoJobStatus.FAILED
                job.error_code = RenderFailure.QUOTA_EXCEEDED.value
                job.error = f"{QUOTA_EXCEEDED_MESSAGE} [{job.error}]"
                job.updated_at = now
                await self._repository.save(job)
            else:
                # 재개 불가(TRANSCODE/GENERATE)거나 재개 한도 초과: 실패 확정.
                #   워커가 남긴 원인이 있으면 그것을 보존하고 정황만 덧붙인다. 스위퍼의 문구로
                #   덮어쓰면 운영자가 보는 건 늘 '타임아웃' 이고, 진짜 이유(벤더 메시지)를 잃는다.
                timeout_note = "reconciliation timeout (callback lost or worker died)"
                job.status = VideoJobStatus.FAILED
                job.error = f"{job.error} [{timeout_note}]" if job.error else timeout_note
                job.updated_at = now
                await self._repository.save(job)
            acted += 1
        return acted
