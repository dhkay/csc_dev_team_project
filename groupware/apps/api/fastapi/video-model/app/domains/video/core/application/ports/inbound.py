"""Inbound Port: 서비스 호출 계약 (router 가 사용). Protocol 로 선언."""

from __future__ import annotations

from typing import Any, Protocol

from ...domain.entities import VideoJob
from ...domain.types import RenderUsage, SceneState, VideoJobStatus, VideoJobType


class VideoJobInboundPort(Protocol):
    """video-model API 측 진입 계약 (오케스트레이션, SSoT 갱신)."""

    async def create_job(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_file_id: str | None = None,
        client_request_id: str | None = None,
    ) -> VideoJob: ...

    async def get_job(self, job_id: str) -> VideoJob | None: ...

    async def apply_callback(
        self,
        job_id: str,
        status: VideoJobStatus,
        result_file_id: str | None = None,
        error: str | None = None,
        captions_file_id: str | None = None,
        usage: RenderUsage | None = None,
        scene_states: list[SceneState] | None = None,
    ) -> VideoJob: ...

    async def rerender_scene(
        self,
        job_id: str,
        order: int,
        visual_prompt: str | None = None,
    ) -> VideoJob | None:
        """씬 하나만 다시 만든다(없으면 None). 나머지 씬은 체크포인트로 건너뛴다.

        완료된 잡은 체크포인트가 지워진 뒤이므로, 잡 행의 scene_states 로 그것을 되살린 다음 대상
        씬만 버린다. 그래서 재과금이 그 씬 하나에 그친다.
        """
        ...

    async def cancel_job(self, job_id: str) -> VideoJob | None:
        """진행 중인 작업을 취소한다(멱등): 없으면 None, 이미 종료면 그대로 반환.

        호출자(csc-marketing)가 프로젝트를 삭제할 때 쓴다. 취소하지 않으면 사라진 프로젝트의 렌더가
        끝까지 돌아 벤더 요금만 나가고 원장에도 남지 않는다(실측 사례가 있었다).
        """
        ...

    async def reconcile_stale(
        self,
        pending_timeout_s: int,
        processing_timeout_s: int,
    ) -> int:
        """콜백 유실 복구: stale PENDING/PROCESSING 을 FAILED 로. 처리 건수 반환."""
        ...
