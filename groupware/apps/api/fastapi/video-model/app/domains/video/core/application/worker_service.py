"""worker 측 오케스트레이션 로직 (무상태 컴퓨트).

arq Worker 가 호출하는 순수 로직: FastAPI/arq 를 모르고 Outbound Port(Protocol)만 사용한다.
DB, 디스크 직접 접근 없음: 파일은 FileGatewayPort(HTTP)로만, 상태는 VideoCallbackPort(콜백)로만.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any

from ..domain.errors import PermanentRenderError
from ..domain.render_failure import failure_code_of
from ..domain.types import VideoJobStatus, VideoJobType
from .ports.outbound import (
    FileGatewayPort,
    VideoCallbackPort,
    VideoProcessingPort,
)


class VideoWorkerService:
    def __init__(
        self,
        files: FileGatewayPort,
        processing: VideoProcessingPort,
        callback: VideoCallbackPort,
    ) -> None:
        self._files = files
        self._processing = processing
        self._callback = callback

    async def run(
        self,
        job_id: str,
        type: VideoJobType,
        params: dict[str, Any],
        source_file_id: str | None,
    ) -> None:
        """작업 1회 시도. 실패는 재던져 큐/스위퍼가 판단하게 한다.

        재시도가 의미 있는지로 가른다:
          - PermanentRenderError(입력 소실 등): 열 번 돌려도 같은 결과 → 즉시 FAILED 로 확정한다.
          - 그 밖의 실패: 상태는 비종료로 두고 원인만 기록한다. 상태 기록은 단조적이라 FAILED 를
            한 번 보내면 이후 성공 콜백이 무시되므로, 아직 성공 가능한 잡을 여기서 못박지 않는다.
            재시도 예산(재큐잉 횟수)은 그것을 아는 스위퍼가 소유하고, 한도에서 실패를 확정한다.

        arq 의 `job_try` 로 마지막 시도인가를 판정하지 않는다. arq 는 일반 예외를 재시도하지
        않으므로(max_tries 는 Retry 예외 전용) 그 판정이 참이 되는 경로가 사실상 없고, 그러면
        실패가 영영 보고되지 않는다.
        """
        await self._callback.callback(job_id, VideoJobStatus.PROCESSING)
        try:
            with tempfile.TemporaryDirectory(prefix=f"videojob-{job_id}-") as tmp:
                source_path: str | None = None
                if source_file_id:
                    source_path = os.path.join(tmp, "source")
                    await self._files.download_source(source_file_id, source_path)

                # job_id 를 params 로 전달: 재개 가능한 처리(COMPOSE)가 체크포인트 키로 쓴다.
                #   다른 provider 는 무시(미지 키). 이렇게 하면 VideoProcessingPort.process 시그니처는 불변.
                result = await self._processing.process(
                    type=type,
                    params={**params, "job_id": job_id},
                    source_path=source_path,
                    out_dir=tmp,
                )
                result_file_id = await self._files.store_result(
                    job_id=job_id,
                    file_name=result.file_name,
                    mime_type=result.mime_type,
                    src_path=result.path,
                    # 소유 귀속(있으면): csc-marketing 이 잡 params 로 조직을 전달한다.
                    organization_id=params.get("organization_id"),
                )
            await self._callback.callback(
                job_id,
                VideoJobStatus.COMPLETED,
                result_file_id=result_file_id,
                captions_file_id=result.captions_file_id,
                # 청구 단위(외부 유료 provider 만): 성공 콜백으로만 올린다. 체크포인트는 성공 시
                #   지워지므로, 이 한 번의 보고가 청구 근거를 영속으로 옮기는 유일한 기회다.
                usage=result.usage,
                # 씬별 결과: 같은 이유로 같은 자리에 실어 보낸다. 체크포인트가 방금 지워졌으므로
                #   이 보고가 씬별 클립 id 를 영속으로 옮기는 유일한 기회다.
                scene_states=result.scene_states,
            )
        except Exception as exc:  # noqa: BLE001 - 재던져 큐가 재시도하게 한다.
            # 사유 코드는 문장과 함께 싣는다. 소비자가 문장으로 한도와 크레딧을 가르면 벤더 문구가
            #   바뀌는 날 어긋난다. 분류되지 않은 실패는 None(일반 실패).
            code = failure_code_of(exc)
            if isinstance(exc, PermanentRenderError):
                # 재시도가 무의미한 실패: 즉시 확정해 사용자가 바로 원인을 본다.
                await self._callback.callback(
                    job_id, VideoJobStatus.FAILED, error=str(exc), error_code=code
                )
            else:
                # 아직 성공 가능한 실패: 상태는 PROCESSING 그대로 두고 원인만 남긴다.
                #   원인을 남기지 않으면 스위퍼가 재큐잉을 반복하다 한도에서 "reconciliation timeout"
                #   으로 확정해, 정작 벤더가 알려준 이유가 사라진다. 그러면 렌더가 만드는중으로
                #   며칠씩 남는다.
                await self._callback.callback(
                    job_id, VideoJobStatus.PROCESSING, error=str(exc), error_code=code
                )
            raise
