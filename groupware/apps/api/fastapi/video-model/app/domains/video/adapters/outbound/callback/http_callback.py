"""VideoCallbackPort 구현: video-model 콜백 엔드포인트로 상태 전이 보고.

콜백 유실이 곧 stale job 이므로 재시도(지수 백오프) 한다. video-model 콜백은 멱등.
재시도/타임아웃/토큰주입은 공유 `csc_net_utils.http_client.ServiceHttpClient` 에 위임한다.
계약: docs/specs/service-http-contract.md §3.
"""

from __future__ import annotations

from collections.abc import Callable

from csc_net_utils.http_client import ServiceHttpClient

from ....core.domain.types import RenderUsage, SceneState, VideoJobStatus


class HttpVideoCallback:
    """VideoCallbackPort(Protocol) 구현."""

    def __init__(
        self,
        base_url: str,
        token_provider: Callable[[], str],
        max_tries: int = 5,
        timeout: float = 15.0,
    ) -> None:
        # 네트워크/타임아웃/5xx 에 한해 지수 백오프 재시도(4xx 는 재시도 무의미: 미재시도).
        self._client = ServiceHttpClient(
            base_url,
            token_provider=token_provider,
            timeout=timeout,
            retries=max_tries - 1,
        )

    async def callback(
        self,
        job_id: str,
        status: VideoJobStatus,
        result_file_id: str | None = None,
        error: str | None = None,
        captions_file_id: str | None = None,
        usage: RenderUsage | None = None,
        scene_states: list[SceneState] | None = None,
        error_code: str | None = None,
    ) -> None:
        await self._client.post(
            f"/video-jobs/{job_id}/callback",
            json={
                "status": status.value,
                "result_file_id": result_file_id,
                "error": error,
                "error_code": error_code,
                "captions_file_id": captions_file_id,
                # 전송은 snake_case: 수신 스키마와 바이트 동일해야 한다.
                "usage": (
                    {
                        "provider": usage.provider,
                        "scene_count": usage.scene_count,
                        "output_video_seconds": usage.output_video_seconds,
                        "input_image_count": usage.input_image_count,
                        "scene_seconds": list(usage.scene_seconds),
                    }
                    if usage
                    else None
                ),
                "scene_states": (
                    [
                        {
                            "order": s.order,
                            "clip_file_id": s.clip_file_id,
                            "billed_seconds": s.billed_seconds,
                            "duration_sec": s.duration_sec,
                        }
                        for s in scene_states
                    ]
                    if scene_states
                    else None
                ),
            },
        )
