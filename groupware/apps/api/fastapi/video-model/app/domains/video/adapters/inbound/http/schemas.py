"""Pydantic 요청/응답 DTO (video 도메인)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from ....core.domain.types import (
    RenderStage,
    SceneRenderStatus,
    VideoJobStatus,
    VideoJobType,
)


class CreateVideoJobRequest(BaseModel):
    type: VideoJobType
    params: dict[str, Any] = Field(default_factory=dict)
    source_file_id: str | None = None
    # 처리 프로바이더(내부 모델/외부 API). 잡 params 에 실려 워커 RoutingVideoProcessing 이 디스패치.
    #   기본 "internal"(ffmpeg). 미등록이면 서버 기본 provider 로 폴백. 출력은 provider 무관 URL 균일.
    provider: str = "internal"
    # 멱등키(선택). 같은 값으로 다시 요청하면 새 작업을 만들지 않고 먼저 만든 작업을 그대로 돌려준다.
    #   호출자가 재시도해도(중간에 끊겨 다시 보내는 경우 포함) 같은 작업이 두 번 만들어지지 않는다.
    #   값은 이 서버 전체에서 유일해야 하므로 호출자 이름을 앞에 붙인다(예: "csc-marketing:saga:12:1").
    client_request_id: str | None = Field(default=None, max_length=160)


class PromptDescriptorResponse(BaseModel):
    """provider 로 나가는 프롬프트 1개."""

    content: str


class PipelinePromptsResponse(BaseModel):
    """이 서버가 파이프라인에서 실제로 쓰는 프롬프트 서술(소비자 화면이 복제 대신 받아 쓴다)."""

    #: 씬 이미지가 있는 씬에 나가는 모션 힌트.
    scene_motion: PromptDescriptorResponse
    #: 화면 속 인물이 대사를 말하게 하는 지시. `{line}` 에 그 씬의 대화내용이 들어간다.
    scene_dialogue: PromptDescriptorResponse
    #: 화면 밖 목소리가 문장을 읽게 하는 지시. `{line}` 에 그 씬의 나레이션이 들어간다.
    scene_narration: PromptDescriptorResponse


class RenderUsageSchema(BaseModel):
    """렌더 1건의 청구 단위: 워커가 보고하고 잡에 영속된다(동결 비용의 근거)."""

    provider: str
    scene_count: int = 0
    output_video_seconds: int = 0
    input_image_count: int = 0
    scene_seconds: list[int] = Field(default_factory=list)


class SceneStateSchema(BaseModel):
    """씬 하나가 만들어진 결과(워커 보고용). 잡 행에 그대로 영속된다."""

    order: int
    clip_file_id: str | None = None
    billed_seconds: int | None = None
    duration_sec: float | None = None


class SceneProgressSchema(BaseModel):
    """씬 하나의 조회용 상태. 진행 중이면 체크포인트에서, 끝난 잡이면 저장된 씬 결과에서 나온다."""

    order: int
    status: SceneRenderStatus
    clip_file_id: str | None = None
    duration_sec: float | None = None
    #: 이 씬을 만든 화면 묘사. 다시 만들기 전에 고칠 대상이라 함께 낸다.
    prompt: str | None = None


class RerenderSceneRequest(BaseModel):
    """씬 하나 다시 만들기 요청."""

    #: 새 화면 묘사(선택). 주면 그 씬의 묘사를 바꾼 뒤 다시 만든다. 없으면 원래 묘사 그대로 만든다.
    visual_prompt: str | None = Field(default=None, max_length=2000)


class VideoJobCallbackRequest(BaseModel):
    status: VideoJobStatus
    result_file_id: str | None = None
    error: str | None = None
    #: 실패 사유 코드(RenderFailure 값). 분류되지 않은 실패와 성공은 null.
    error_code: str | None = None
    captions_file_id: str | None = None
    #: 외부 유료 provider 만 채워진다. 내부(사내 GPU)는 null: '무료' 의 표현이다.
    usage: RenderUsageSchema | None = None
    #: 씬별 결과(COMPOSE 만). 체크포인트가 성공 시 지워지므로 이 보고가 유일한 영속 기회다.
    scene_states: list[SceneStateSchema] | None = None


class VideoJobResponse(BaseModel):
    id: str
    type: VideoJobType
    status: VideoJobStatus
    source_file_id: str | None
    result_file_id: str | None
    error: str | None
    # 실패 사유 코드(RenderFailure 값: rate_limited, quota_exceeded, credit_exhausted, credential_missing,
    #   content_rejected, vendor_refused, input_missing). 소비자는 이 값으로 알림을 가르고 문장은 그대로
    #   보인다. 분류되지 않은 실패와 성공은 null.
    error_code: str | None = None
    # 시간동기 자막 트랙(JSON) file-service id: COMPOSE 완료 시(그 외 None). 최종(FINALIZE)이 fetch.
    captions_file_id: str | None = None
    # 렌더 진행률(0~100): COMPOSE 진행 중일 때만 채워진다(그 외 None).
    progress: int | None = None
    # 워커 생사: 비종료 잡일 때만 채워진다(그 외 None). False = 소비 워커 없음(정체 신호).
    worker_alive: bool | None = None
    # 청구 단위(영속): 외부 유료 provider 로 렌더한 경우만. csc-marketing 이 비용 계산에 쓴다.
    usage: RenderUsageSchema | None = None
    # 렌더 구간: 씬을 만드는 중(SCENES)인지 다 만들고 마무리 중(FINALIZING)인지. COMPOSE 만.
    #   더 잘게 나누지 않는 이유: 마무리 구간은 한 흐름으로 이어져 그 사이를 알리는 기록이 없다.
    render_stage: RenderStage | None = None
    # 씬별 상태(COMPOSE 만). 진행 중이면 체크포인트에서, 끝난 잡이면 저장된 씬 결과에서 나온다.
    scenes: list[SceneProgressSchema] | None = None
    created_at: datetime | None
    updated_at: datetime | None
