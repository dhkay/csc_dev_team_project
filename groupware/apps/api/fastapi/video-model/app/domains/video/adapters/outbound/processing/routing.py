"""VideoProcessingPort 라우터: 잡 provider 별로 실제 처리 어댑터에 디스패치.

잡 `params["provider"]`(내부 모델/외부 API 식별자)로 어느 어댑터가 처리할지 고른다. 레지스트리에
없는 provider 는 `default_provider` 로 폴백한다. 내부 N개 + 외부 N개를 각각 provider key 로 꽂으면 되고,
출력은 provider 무관하게 `ProcessedResult(path)` → 워커 store_result → URL 로 균일하다.
language-model 의 `RoutingInference`(inference/adapters/outbound/inference/routing.py)와 동형.
"""

from __future__ import annotations

from typing import Any

from ....core.application.ports.outbound import VideoProcessingPort
from ....core.domain.types import ProcessedResult, VideoJobType


class RoutingVideoProcessing:
    """provider→VideoProcessingPort 레지스트리로 디스패치하는 VideoProcessingPort 구현."""

    def __init__(
        self, adapters: dict[str, VideoProcessingPort], default_provider: str
    ) -> None:
        if default_provider not in adapters:
            raise ValueError(
                f"default_provider {default_provider!r} 가 레지스트리에 없습니다"
                f" (등록: {sorted(adapters)})"
            )
        self._adapters = adapters
        self._default = default_provider

    def _pick(self, params: dict[str, Any]) -> VideoProcessingPort:
        provider = params.get("provider") or self._default
        # 미등록 provider 는 default 로 폴백.
        return self._adapters.get(provider) or self._adapters[self._default]

    async def process(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_path: str | None,
        out_dir: str,
    ) -> ProcessedResult:
        return await self._pick(params).process(
            type=type, params=params, source_path=source_path, out_dir=out_dir
        )
