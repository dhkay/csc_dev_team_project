"""Outbound Port: 외부 의존성 계약. Protocol 로 선언.

두 묶음:
- API 측: VideoJobRepositoryPort(영속), JobQueuePort(arq enqueue)
- worker 측: FileGatewayPort(file-service HTTP), VideoCallbackPort(콜백 HTTP), VideoProcessingPort(ffmpeg/AI)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from ...domain.entities import VideoJob
from ...domain.types import (
    ProcessedResult,
    RenderUsage,
    SceneState,
    VideoJobStatus,
    VideoJobType,
)


# ---------- API 측 ----------
class VideoJobRepositoryPort(Protocol):
    async def save(self, job: VideoJob) -> VideoJob: ...

    async def find_by_id(self, job_id: str) -> VideoJob | None: ...

    async def find_by_client_request_id(self, key: str) -> VideoJob | None:
        """멱등키로 조회. 같은 요청이 이미 잡을 만들었는지 확인한다(중복 등록 차단)."""
        ...

    async def find_stale(
        self,
        pending_before: datetime,
        processing_before: datetime,
    ) -> list[VideoJob]: ...

    async def count_active(self) -> int:
        """비종료(PENDING/PROCESSING) 잡 수: 스위퍼의 '워커 없는데 밀린 잡 있음' 경고 판정용."""
        ...


class JobQueuePort(Protocol):
    """Redis(arq) 큐: 작업 전달 전용(상태 보관 안 함)."""

    async def enqueue(self, job: VideoJob) -> None: ...

    async def requeue(self, job: VideoJob) -> None:
        """완료로 마킹된(재개 필요한) 작업을 다시 큐에 넣는다. arq 결과 키를 지워 재실행 가능하게 한다.

        arq 는 `_job_id` 로 중복 enqueue 를 막는데, 한 번 '완료'로 기록되면 재enqueue 가 무시된다.
        워커가 렌더 도중 죽어(graceful 종료 등) '완료'로 남은 잡을, 결과 기록을 지운 뒤 다시 태워
        새 워커가 체크포인트로 이어서 하게 한다(스위퍼가 호출).
        """
        ...

    async def abort(self, job_id: str) -> None:
        """이 작업을 큐에서 중단시킨다(대기 중이면 제거, 실행 중이면 취소 신호).

        멱등하고 best-effort 다. 이미 끝났거나 없으면 아무 일도 하지 않는다. 상태(SSoT)는 서비스가
        따로 CANCELED 로 확정하므로, 중단이 실패해도 스위퍼가 그 잡을 되살리지는 않는다.
        """
        ...

    async def is_alive(self, job_id: str) -> bool:
        """이 작업이 아직 큐에 살아 있는가(대기 중이거나 처리 중).

        스위퍼가 "죽었는지"를 나이로 추측하지 않고 큐에 직접 물어보기 위한 것이다. 큐가 유일한
        권위다. 작업이 오래 PENDING 인 건 죽어서가 아니라 앞에 밀려서일 수 있고(공유 GPU/워커 슬롯),
        그걸 실패로 단정하면 멀쩡히 처리될 작업을 되돌릴 수 없게 죽인다.
        """
        ...

    async def worker_alive(self) -> bool:
        """arq 워커가 지금 큐를 소비 중인가: 잡 개별이 아니라 워커 프로세스 생사(하트비트 키 존재).

        API 조회/스위퍼가 이걸 읽어, 비종료 잡이 워커 없이 방치되는 걸(무한 RENDERING) STALLED 로
        표출한다. is_alive(job_id) 는 "이 잡이 큐에 있나"이고, 이건 "소비자가 있나"라 다르다.
        """
        ...


# ---------- worker 측 ----------
class FileGatewayPort(Protocol):
    """file-service 단독 권위자에 HTTP 로만 접근(디스크 미접촉)."""

    async def download_source(self, file_id: str, dest_path: str) -> None: ...

    async def store_result(
        self,
        job_id: str,
        file_name: str,
        mime_type: str,
        src_path: str,
        organization_id: int | None = None,
    ) -> str:
        """결과 파일 저장(멱등 키=job_id) -> result_file_id 반환.

        organization_id: 소유 조직(있으면 file-service 소유 인덱스에 귀속: 영상 산출물도
        조직 삭제/아카이브 대상이 되게). csc-marketing 이 잡 params 로 전달.
        """
        ...


class VideoCallbackPort(Protocol):
    """video-model 콜백 엔드포인트로 상태 전이 보고(재시도, 멱등)."""

    async def callback(
        self,
        job_id: str,
        status: VideoJobStatus,
        result_file_id: str | None = None,
        error: str | None = None,
        captions_file_id: str | None = None,
        usage: RenderUsage | None = None,
        scene_states: list[SceneState] | None = None,
        # 실패 사유 코드(RenderFailure 값). 분류되지 않은 실패와 성공은 None.
        error_code: str | None = None,
    ) -> None: ...


class VideoProcessingPort(Protocol):
    """실제 영상 처리(ffmpeg/외부 생성 API). 파일 경로 기반."""

    async def process(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_path: str | None,
        out_dir: str,
    ) -> ProcessedResult: ...


class TtsPort(Protocol):
    """텍스트→음성 합성(TTS). COMPOSE 잡의 씬별 나레이션을 음성 파일로 만든다.

    provider 교체 가능(edge-tts / ElevenLabs). 출력은 out_path 에 오디오 파일(mp3 등)로 쓴다.
    voice/pitch 는 provider 별 음성 식별자/피치(예: edge-tts 'ko-KR-SunHiNeural', '+0Hz').

    `provider`/`api_key` 는 키워드 전용이다. 씬 비주얼이 조직 키를 params 로 받는 것과 같은
    이유로 어댑터가 키를 보관하지 않게 하고, 라우터가 provider 로 어댑터를 고른다. 키가 필요 없는
    provider(edge-tts)는 둘 다 무시한다. 기본값을 둬서 그 어댑터가 인자를 선언하지 않아도 되게 한다.
    """

    async def synthesize(
        self,
        text: str,
        voice: str,
        pitch: str,
        out_path: str,
        *,
        provider: str = "",
        api_key: str = "",
    ) -> None: ...


@runtime_checkable
class ResumableVisualPort(Protocol):
    """씬 비주얼을 제출/폴링 2단계로 나눈 provider: 워커가 죽어도 재개할 수 있다.

    렌더는 외부 엔진(ComfyUI, video-ai-server)에 durable 하게 남는다. 제출 즉시 external handle
    (prompt_id)을 받아 영속해 두면, 워커가 재시작해도 재제출 없이 같은 handle 로 재폴링해 이미
    끝났거나 진행 중인 렌더를 회수한다(GPU 재작업 0). 이 계약을 만족하지 못하는 provider(예: slideshow
    렌더가 수 초라 굳이 나눌 필요 없음)는 VideoProcessingPort.process 를 그대로 쓴다.
    """

    async def submit(self, params: dict[str, Any], source_path: str | None) -> str:
        """렌더를 외부 엔진에 제출하고 handle(예: ComfyUI prompt_id)을 반환. 즉시 영속 대상."""
        ...

    async def poll_to_file(
        self, handle: str, out_dir: str, params: dict[str, Any] | None = None
    ) -> str:
        """handle 의 완료를 기다려(멱등, 재시작 후에도 안전) 결과물을 out_dir 에 받고 경로를 반환.

        params = 렌더 컨텍스트(submit 과 동일 dict). 폴링에 인증이 필요한 provider(예: xAI Bearer)를 위해
        매 실행 재공급된다. 워커 재시작(재개) 후에도 조직 키를 다시 넘길 수 있게 optional 로 받는다.
        내부 엔진(ComfyUI 등)은 무시한다.
        """
        ...


@runtime_checkable
class BillableVisualPort(Protocol):
    """청구 단위를 스스로 보고할 수 있는 씬 비주얼: 외부 유료 provider 만 구현한다.

    근거를 provider 안에 두는 이유: 실제 청구 단위는 provider 가 벤더에 보낸 값이다.
    xAI 는 duration 을 정수초(1~15)로 클램프해 받고 그 값으로 과금하므로, 합성 결과물을 probe 한
    길이(나레이션에 맞춰 늘린 값)로 계산하면 긴 씬은 과다, 짧은 씬은 반올림 오차가 난다.

    내부 provider(slideshow/wan)는 이 프로토콜을 구현하지 않으며, 그 부재가 곧 '무료' 의 표현이다
    (0 을 보고하는 것과 다르다. 0 은 '쟀는데 0' 으로 읽힌다).
    """

    def billable_seconds(self, params: dict[str, Any]) -> int | None:
        """이 씬 렌더로 벤더에 청구될 초. submit 에 보내는 값과 같은 식이어야 한다.

        `None` = 유료 provider 인데 우리가 길이를 정하지 않았다(그 모델이 duration 을 받지 않아
        벤더 기본 길이로 만들어진다). 0 을 쓰지 않는 이유는 위와 같다: 0 은 '쟀는데 0' 이다.
        호출부는 None 인 씬을 청구 초 합계에서 뺀다(모르는 값을 지어내지 않는다).
        """
        ...


class SceneCheckpointPort(Protocol):
    """COMPOSE 잡의 씬별 진행을 durable 하게 기록/조회한다. 재시작/재시도 시 이어서 하기 위한 것.

    워커 프로세스가 죽으면 로컬 temp 는 사라지므로(잡마다 새 tmp), 씬 진행은 프로세스 밖(redis 등)에
    남겨야 한다. 씬별로 남기는 것: external 렌더 handle(prompt_id) + 완성 클립의 file_id(내구 저장).
    다음 실행은 완료 씬을 건너뛰고, 진행 중 씬은 handle 로 재폴링한다.
    """

    async def load(self, job_id: str) -> dict[int, dict[str, Any]]:
        """{scene_order: {"prompt_id"?, "clip_file_id"?, "billed_seconds"?}} 반환(없으면 빈 dict)."""
        ...

    async def drop_scene_handle(self, job_id: str, order: int) -> None:
        """그 씬의 렌더 handle(prompt_id)만 버린다. 완성 클립/청구 초는 보존한다.

        벤더가 요청을 확정 실패로 못박은 경우(DeadVisualHandleError)에만 쓴다. handle 을 남겨두면
        다음 시도가 같은 죽은 요청을 재폴링해 영원히 같은 실패를 되풀이한다. 버리면 새로 제출한다.
        """
        ...

    async def drop_scene(self, job_id: str, order: int) -> None:
        """그 씬을 통째로 버린다(handle + 완성 클립 + 청구 초). 다른 씬은 건드리지 않는다.

        사용자가 씬 하나를 다시 만들라고 했을 때 쓴다. 위 drop_scene_handle 로는 안 된다: 그쪽은
        완성 클립을 일부러 남기므로 다음 실행이 그 클립을 재사용해 아무것도 다시 만들지 않는다.
        반대로 clear 를 쓰면 전 씬이 다시 돌아 전액 재과금된다. 그래서 씬 하나만 버리는 문이 따로 있다.
        """
        ...

    async def save_scene(
        self,
        job_id: str,
        order: int,
        *,
        prompt_id: str | None = None,
        clip_file_id: str | None = None,
        billed_seconds: int | None = None,
    ) -> None:
        """씬 진행 갱신(부분 병합). 제출 직후 prompt_id, 클립 완성 후 clip_file_id 를 남긴다.

        billed_seconds 를 prompt_id 와 같은 순간(제출 직후) 쓰는 이유: 그때가 벤더 과금이
        발생하는 시점이고 체크포인트 쓰기가 이미 거기서 일어나므로 새 실패 지점이 생기지 않는다.
        메모리에만 누적하면 워커가 죽고 재개할 때 완료 씬을 건너뛰어 과소 계산된다.
        """
        ...

    async def clear(self, job_id: str) -> None:
        """잡 완료 시 체크포인트 정리(재사용 방지)."""
        ...
