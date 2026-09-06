"""ORM 모델 ↔ Domain Entity 변환. ORM 이 도메인 밖으로 새지 않게 한다."""

from __future__ import annotations

from ....core.domain.entities import VideoJob
from ....core.domain.types import (
    RenderUsage,
    SceneState,
    VideoJobStatus,
    VideoJobType,
)
from .models import VideoJobModel


def to_domain(row: VideoJobModel) -> VideoJob:
    return VideoJob(
        id=row.id,
        type=VideoJobType(row.type),
        status=VideoJobStatus(row.status),
        params=row.params or {},
        source_file_id=row.source_file_id,
        client_request_id=row.client_request_id,
        result_file_id=row.result_file_id,
        captions_file_id=row.captions_file_id,
        usage=_usage_from_json(row.usage),
        scene_states=_scene_states_from_json(row.scene_states),
        error=row.error,
        error_code=row.error_code,
        attempts=row.attempts,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def to_model(entity: VideoJob) -> VideoJobModel:
    return VideoJobModel(
        id=entity.id,
        type=entity.type.value,
        status=entity.status.value,
        params=entity.params,
        source_file_id=entity.source_file_id,
        client_request_id=entity.client_request_id,
        result_file_id=entity.result_file_id,
        captions_file_id=entity.captions_file_id,
        usage=_usage_to_json(entity.usage),
        scene_states=_scene_states_to_json(entity.scene_states),
        error=entity.error,
        error_code=entity.error_code,
        attempts=entity.attempts,
        created_at=entity.created_at,
        updated_at=entity.updated_at,
    )

def _usage_to_json(usage: RenderUsage | None) -> dict | None:
    """도메인 청구 단위 → JSONB. None 은 그대로 None(무료/미측정의 표현)."""
    if usage is None:
        return None
    return {
        "provider": usage.provider,
        "scene_count": usage.scene_count,
        "output_video_seconds": usage.output_video_seconds,
        "input_image_count": usage.input_image_count,
        "scene_seconds": list(usage.scene_seconds),
    }


def _usage_from_json(raw: dict | None) -> RenderUsage | None:
    """JSONB → 도메인. 손상/구형 행은 None 으로 접는다(조회가 깨지지 않게)."""
    if not isinstance(raw, dict):
        return None
    seconds = raw.get("scene_seconds")
    return RenderUsage(
        provider=str(raw.get("provider") or ""),
        scene_count=int(raw.get("scene_count") or 0),
        output_video_seconds=int(raw.get("output_video_seconds") or 0),
        input_image_count=int(raw.get("input_image_count") or 0),
        scene_seconds=[int(x) for x in seconds] if isinstance(seconds, list) else [],
    )


def _scene_states_to_json(states: list[SceneState] | None) -> list[dict] | None:
    """도메인 씬 결과 → JSONB. None 은 그대로 None(COMPOSE 가 아니거나 아직 안 끝난 잡)."""
    if states is None:
        return None
    return [
        {
            "order": s.order,
            "clip_file_id": s.clip_file_id,
            "billed_seconds": s.billed_seconds,
            "duration_sec": s.duration_sec,
        }
        for s in states
    ]


def _scene_states_from_json(raw: list | None) -> list[SceneState] | None:
    """JSONB → 도메인. 손상/구형 행은 None 으로 접는다(조회가 깨지지 않게: usage 와 같은 규칙)."""
    if not isinstance(raw, list):
        return None
    states: list[SceneState] = []
    for item in raw:
        if not isinstance(item, dict) or item.get("order") is None:
            continue
        billed = item.get("billed_seconds")
        duration = item.get("duration_sec")
        states.append(
            SceneState(
                order=int(item["order"]),
                clip_file_id=item.get("clip_file_id") or None,
                billed_seconds=int(billed) if billed is not None else None,
                duration_sec=float(duration) if duration is not None else None,
            )
        )
    return states
