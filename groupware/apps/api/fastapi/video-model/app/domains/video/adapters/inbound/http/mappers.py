"""Domain Entity -> 응답 DTO 변환."""

from __future__ import annotations

from ....core.domain.entities import VideoJob
from ....core.domain.prompts import (
    SCENE_DIALOGUE_PROMPT,
    SCENE_MOTION_PROMPT,
    SCENE_NARRATION_PROMPT,
    PromptDescriptor,
)
from .schemas import (
    PipelinePromptsResponse,
    PromptDescriptorResponse,
    RenderUsageSchema,
    SceneProgressSchema,
    VideoJobResponse,
)


def to_response(job: VideoJob) -> VideoJobResponse:
    return VideoJobResponse(
        id=job.id,
        type=job.type,
        status=job.status,
        source_file_id=job.source_file_id,
        result_file_id=job.result_file_id,
        error=job.error,
        error_code=job.error_code,
        captions_file_id=job.captions_file_id,
        progress=job.progress,
        worker_alive=job.worker_alive,
        usage=(
            RenderUsageSchema(
                provider=job.usage.provider,
                scene_count=job.usage.scene_count,
                output_video_seconds=job.usage.output_video_seconds,
                input_image_count=job.usage.input_image_count,
                scene_seconds=list(job.usage.scene_seconds),
            )
            if job.usage
            else None
        ),
        render_stage=job.render_stage,
        scenes=(
            [
                SceneProgressSchema(
                    order=s.order,
                    status=s.status,
                    clip_file_id=s.clip_file_id,
                    duration_sec=s.duration_sec,
                    prompt=s.prompt,
                )
                for s in job.scenes
            ]
            if job.scenes is not None
            else None
        ),
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _to_prompt_descriptor(p: PromptDescriptor) -> PromptDescriptorResponse:
    return PromptDescriptorResponse(content=p.content)


def to_pipeline_prompts_response() -> PipelinePromptsResponse:
    """도메인 프롬프트 SSOT -> 응답. 소비자가 값을 복제하지 않고 이걸 받아 쓴다."""
    return PipelinePromptsResponse(
        scene_motion=_to_prompt_descriptor(SCENE_MOTION_PROMPT),
        scene_dialogue=_to_prompt_descriptor(SCENE_DIALOGUE_PROMPT),
        scene_narration=_to_prompt_descriptor(SCENE_NARRATION_PROMPT),
    )
