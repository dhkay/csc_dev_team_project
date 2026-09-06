"""도메인 엔티티: 순수 dataclass (ORM 무관).

video 도메인의 핵심 단위 = 미디어 작업(VideoJob). 상태의 진실원(SSoT)이며
video-model 만 기록한다(worker 는 콜백으로 상태 전이를 요청). 파일 자체는 보유하지 않고
source_file_id / result_file_id 로 file-service 의 에셋을 참조만 한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .types import (
    RenderStage,
    RenderUsage,
    SceneProgress,
    SceneState,
    VideoJobStatus,
    VideoJobType,
)


@dataclass
class VideoJob:
    id: str
    type: VideoJobType
    status: VideoJobStatus
    params: dict[str, Any] = field(default_factory=dict)
    source_file_id: str | None = None
    # 호출자 멱등키(없으면 None). 같은 키로 다시 오면 새 잡을 만들지 않고 먼저 만든 잡을 돌려준다.
    #   호출자는 재시도에도 변하지 않는 값을 보낸다(사가 단계 키 등). 유일성 범위는 이 서버 전체이므로
    #   호출자가 자기 이름을 접두사로 붙인다(예: "csc-marketing:saga:12:1").
    client_request_id: str | None = None
    result_file_id: str | None = None
    # 시간동기 자막 트랙(JSON) file-service id: COMPOSE 완료 시 채워지고 최종(FINALIZE)이 fetch. 영속.
    captions_file_id: str | None = None
    error: str | None = None
    # 실패 사유 코드(RenderFailure 값). error 가 사람 문장이라면 이것은 소비자가 가르는 값이다.
    #   분류되지 않은 실패와 성공은 None. error 와 같은 시점에 같은 콜백으로 갱신된다.
    error_code: str | None = None
    attempts: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    # 렌더 진행률(0~100): 영속 아님. COMPOSE 조회 시 씬 체크포인트로 계산해 채운다(그 외 None).
    progress: int | None = None
    # 워커 생사: 영속 아님. 비종료 잡 조회 시 큐 하트비트로 채운다(그 외 None). False 면 소비자 없음(정체).
    worker_alive: bool | None = None
    # 청구 단위: 영속(progress/worker_alive 와 다르다). 외부 유료 provider 렌더만 채워진다.
    #   체크포인트가 성공 시 지워지므로 여기 저장하지 않으면 청구 근거를 되살릴 방법이 없다.
    usage: RenderUsage | None = None
    # 씬별 결과: 영속(usage 와 같은 이유). 완료된 잡의 세그먼트 격자와 씬 단위 재렌더가 이 값에 기댄다.
    scene_states: list[SceneState] | None = None
    # 씬별 조회용 상태: 영속 아님. COMPOSE 조회 시 체크포인트(진행 중) 또는 scene_states(종료)에서 파생.
    scenes: list[SceneProgress] | None = None
    # 렌더 구간: 영속 아님. 위 scenes 에서 파생한다(씬이 남았나 / 다 끝났나).
    render_stage: RenderStage | None = None
