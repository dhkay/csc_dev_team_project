"""도메인 Enum / Type (video 도메인).

video-model = 미디어 작업 오케스트레이션, 상태(SSoT). 실제 파일/처리는 worker, file-service.
여기서는 FastAPI, SQLAlchemy 를 import 하지 않는다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class VideoJobStatus(str, Enum):
    PENDING = "PENDING"        # 생성, enqueue 됨, 아직 워커 미착수
    PROCESSING = "PROCESSING"  # 워커 처리 중
    COMPLETED = "COMPLETED"    # 결과 파일 저장, 등록 완료
    FAILED = "FAILED"          # 처리 실패 또는 스위퍼 타임아웃
    CANCELED = "CANCELED"      # 요청자가 취소(예: 프로젝트 삭제): 실패와 구분해 원장을 정직하게 남긴다


class VideoJobType(str, Enum):
    TRANSCODE = "TRANSCODE"    # 원본 영상 -> 변환(H.264/AAC 등)
    GENERATE = "GENERATE"      # AI 생성(원본 없이 결과 도출)
    COMPOSE = "COMPOSE"        # 다중 씬 조합(씬별 비주얼+TTS+자막 -> 이어붙인 쇼츠). params 에 조합 스펙.
    FINALIZE = "FINALIZE"      # 최종 합성(원천 영상 + 세트: 프레임 오버레이 + 아웃트로 concat).


@dataclass(frozen=True)
class RenderUsage:
    """렌더 1건이 외부 벤더에 발생시킨 청구 단위: 동결 비용의 근거.

    청구 단위는 우리가 벤더에 보낸 값이다. xAI 는 duration 을 정수초(1~15)로 클램프해 받고 그
    값으로 과금한다. 반면 합성 결과물을 probe 한 길이는 나레이션에 맞춰 늘린 뒤의 값(2.0~20.0 float)
    이라, 그걸로 계산하면 긴 씬은 과다 청구되고 모든 씬에 반올림 오차가 붙는다.
    그래서 provider 가 submit 시점에 스스로 보고한다(BillableVisualPort).

    provider: 유효 씬 비주얼 provider key(요청값이 아니다). 미배포 provider 는 slideshow 로
      폴백되므로 요청한 grok 이 실제로는 안 돌 수 있다. 비용은 실제로 돈이 나간 쪽에만 붙어야 한다.
    """

    provider: str
    scene_count: int
    output_video_seconds: int
    input_image_count: int
    #: 씬별 청구 초: 벤더 콘솔 대조를 영상 단위로 할 수 있게 남긴다(JSONB 라 추가 비용 0).
    scene_seconds: list[int] = field(default_factory=list)


class SceneRenderStatus(str, Enum):
    """씬 하나가 지금 어디에 있는가. 체크포인트의 두 필드로 판정한다."""

    WAITING = "waiting"    # 아직 벤더에 보내지 않았다(handle 도 클립도 없다)
    RUNNING = "running"    # 보냈고 아직 안 돌아왔다(handle 만 있다)
    DONE = "done"          # 클립이 만들어져 durable 저장됐다


class RenderStage(str, Enum):
    """COMPOSE 잡이 지금 밟는 구간. 씬 상태에서 파생한다(따로 기록하지 않는다).

    둘로만 나누는 이유: 씬을 다 만든 뒤의 일(이어붙이기, 오디오 믹스, 자막, 업로드)은 한 흐름으로
    이어지고 그 사이를 알리는 기록이 없다. 없는 구분을 지어내면 화면이 실제와 무관하게 진행하는
    척하게 된다. 더 잘게 나누려면 compose 가 구간마다 그 사실을 남겨야 한다.
    """

    SCENES = "SCENES"          # 아직 못 만든 씬이 있다
    FINALIZING = "FINALIZING"  # 씬은 다 만들었고 이어붙이기~업로드가 남았다


@dataclass(frozen=True)
class SceneState:
    """씬 하나가 만들어진 결과. 영속(usage 와 같은 이유, 같은 자리).

    체크포인트는 성공 시 지워지고(compose) 24시간 TTL 이라, 저장하지 않으면 완료된 잡의 씬별 클립을
    되살릴 방법이 없다. 그 클립 id 가 두 가지를 성립시킨다.

      1. 완료된 영상의 세그먼트 격자(어느 칸이 무엇이 되었는지 보고 다시 만들 칸을 고른다)
      2. 씬 하나만 다시 만들기. 재실행 시 이 값으로 체크포인트를 되살려야 나머지 씬을 건너뛴다.
         없으면 전 씬이 다시 돌아 전액 재과금된다.
    """

    order: int
    clip_file_id: str | None = None
    billed_seconds: int | None = None
    #: 실제 클립 길이(초). concat 전에 측정한 값이라 화면이 적는 길이와 재생되는 길이가 같다.
    duration_sec: float | None = None


@dataclass(frozen=True)
class SceneProgress:
    """씬 하나의 조회용 표현. 영속 아님(progress 와 같다).

    진행 중이면 체크포인트에서, 끝난 잡이면 SceneState 에서 파생한다. 두 출처가 같은 모양으로 나오므로
    보는 쪽은 잡이 끝났는지 몰라도 된다.
    """

    order: int
    status: SceneRenderStatus
    clip_file_id: str | None = None
    duration_sec: float | None = None
    #: 이 씬을 만든 화면 묘사. 다시 만들기 전에 고칠 대상이라 함께 낸다.
    prompt: str | None = None


@dataclass(frozen=True)
class ProcessedResult:
    """worker 처리 산출물(파일 경로 기반: ffmpeg 친화)."""

    path: str
    file_name: str
    mime_type: str
    # 부가 아티팩트: COMPOSE 가 만든 시간동기 자막 트랙(JSON)의 file-service id. 최종(FINALIZE)이 fetch. 그 외 None.
    captions_file_id: str | None = None
    # 청구 단위. 내부 provider(slideshow/wan)는 0 이 아니라 None: '무료라서 0' 과 '못 재서 0' 을
    #   구분해야 화면이 거짓말하지 않는다. FINALIZE 도 벤더가 없어 None 이다.
    usage: RenderUsage | None = None
    # 씬별 결과(COMPOSE 만). usage 와 같은 이유로 콜백에 실어 잡 행에 남긴다.
    scene_states: list[SceneState] | None = None
