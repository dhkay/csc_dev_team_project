"""Inbound Adapter: APIRouter -> Inbound Port 호출 (video 도메인).

ORM 직접 import 금지. 도메인 에러(LookupError)는 여기서 HTTP 로 변환한다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from csc_net_utils import require_services

from ....core.application.ports.inbound import VideoJobInboundPort
from ....core.domain.types import RenderUsage, SceneState
from . import mappers
from .schemas import (
    CreateVideoJobRequest,
    PipelinePromptsResponse,
    RerenderSceneRequest,
    VideoJobCallbackRequest,
    VideoJobResponse,
)


def get_video_job_service() -> VideoJobInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


router = APIRouter(prefix="/video-jobs", tags=["video"])

# 파이프라인 서술: 잡(작업) 이 아니라 이 서버가 무엇으로 렌더하는지의 메타 정보.
pipeline_router = APIRouter(prefix="/pipeline", tags=["video"])


@pipeline_router.get(
    "/prompts",
    response_model=PipelinePromptsResponse,
    summary="[VIDEO-004] 파이프라인 프롬프트 서술",
    dependencies=[Depends(require_services("csc-marketing"))],
)
async def get_pipeline_prompts() -> PipelinePromptsResponse:
    """이 서버가 provider 에 실제로 보내는 프롬프트를 그대로 내려준다.

    소비자(csc-marketing 프로세스 화면)가 값을 베껴 두지 않게 하려는 것. 여기 도메인 상수를 고치면
    소비자 화면이 따라온다. 상태 없는 정적 서술이라 서비스 계층을 거치지 않는다.
    """
    return mappers.to_pipeline_prompts_response()


@router.post(
    "",
    response_model=VideoJobResponse,
    summary="[VIDEO-001] 영상 작업 생성",
    dependencies=[Depends(require_services("csc-groupware", "csc-marketing"))],
)
async def create_job(
    body: CreateVideoJobRequest,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    # 소비자(메인서버/도구) -> video-model: 작업 생성 + enqueue.
    # provider 는 params 에 실어 워커 RoutingVideoProcessing 이 잡별로 어댑터를 고른다.
    params = {**body.params, "provider": body.provider}
    job = await service.create_job(
        body.type,
        params,
        body.source_file_id,
        body.client_request_id,
    )
    return mappers.to_response(job)


@router.get(
    "/{job_id}",
    response_model=VideoJobResponse,
    summary="[VIDEO-002] 영상 작업 조회",
    dependencies=[Depends(require_services("csc-groupware", "csc-marketing"))],
)
async def get_job(
    job_id: str,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    job = await service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="video job not found")
    return mappers.to_response(job)


@router.post(
    "/{job_id}/cancel",
    response_model=VideoJobResponse,
    summary="[VIDEO-005] 영상 작업 취소",
    dependencies=[Depends(require_services("csc-groupware", "csc-marketing"))],
)
async def cancel_job(
    job_id: str,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    """진행 중 렌더를 취소한다(멱등): 프로젝트 삭제 시 호출자가 부른다.

    취소하지 않으면 사라진 프로젝트의 렌더가 끝까지 돌아 벤더 요금만 나가고 원장에도 남지 않는다.
    이미 끝난 잡은 그대로 반환한다(취소가 결과를 되돌리지는 않는다).
    """
    job = await service.cancel_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="video job not found")
    return mappers.to_response(job)


@router.post(
    "/{job_id}/callback",
    response_model=VideoJobResponse,
    summary="[VIDEO-003] 워커 콜백 수신",
    dependencies=[Depends(require_services("video-model"))],
)
async def callback(
    job_id: str,
    body: VideoJobCallbackRequest,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    # worker -> video-model: 상태 전이(유일 라이터). 재시도, 멱등 안전.
    try:
        job = await service.apply_callback(
            job_id,
            body.status,
            body.result_file_id,
            body.error,
            body.captions_file_id,
            error_code=body.error_code,
            # 청구 단위: 워커 보고를 도메인 형태로 옮겨 영속시킨다.
            usage=(
                RenderUsage(
                    provider=body.usage.provider,
                    scene_count=body.usage.scene_count,
                    output_video_seconds=body.usage.output_video_seconds,
                    input_image_count=body.usage.input_image_count,
                    scene_seconds=list(body.usage.scene_seconds),
                )
                if body.usage
                else None
            ),
            # 씬별 결과: 같은 이유로 같은 자리에서 영속시킨다(체크포인트는 방금 지워졌다).
            scene_states=(
                [
                    SceneState(
                        order=s.order,
                        clip_file_id=s.clip_file_id,
                        billed_seconds=s.billed_seconds,
                        duration_sec=s.duration_sec,
                    )
                    for s in body.scene_states
                ]
                if body.scene_states is not None
                else None
            ),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="video job not found") from exc
    return mappers.to_response(job)


@router.post(
    "/{job_id}/scenes/{order}/render",
    response_model=VideoJobResponse,
    summary="[VIDEO-020] 씬 하나 다시 만들기",
    dependencies=[Depends(require_services("csc-marketing"))],
    responses={
        400: {"description": "씬 단위로 다시 만들 수 없는 작업(다중 씬 조합이 아닌 작업)"},
        404: {"description": "작업이 없거나 그 순번의 씬이 없음"},
    },
)
async def rerender_scene(
    job_id: str,
    order: int,
    body: RerenderSceneRequest,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    """이 작업의 씬 하나만 다시 만든다. 나머지 씬은 이미 만든 결과를 그대로 쓴다.

    `visual_prompt` 를 주면 그 씬의 화면 묘사를 바꾼 뒤 다시 만든다. 주지 않으면 원래 묘사 그대로
    한 번 더 만든다(같은 묘사라도 결과는 매번 다르다).

    작업 상태는 다시 진행 중으로 돌아가고 결과 영상은 비워진다. 전체 영상은 다시 만든 씬을 포함해
    처음부터 이어붙여지므로, 완료될 때까지 이전 결과 영상은 조회되지 않는다. 진행 상황은
    `/video-jobs/{job_id}` 으로 확인한다.

    벤더 비용은 다시 만드는 씬 하나에만 발생한다.
    """
    try:
        job = await service.rerender_scene(job_id, order, body.visual_prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="video scene not found") from exc
    if job is None:
        raise HTTPException(status_code=404, detail="video job not found")
    return mappers.to_response(job)
