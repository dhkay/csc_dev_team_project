"""이미지 생성 실패 사유: 통합 카탈로그(SSOT). 프레임워크 비종속.

한 곳에 모으는 이유. 사유가 어댑터마다 흩어져 있으면 같은 성격의 실패가 벤더별로 다른 문구/상태로
새어나가고, 작업자는 원인도 조치도 알 수 없다. 결제 한도 초과와 안전 정책 거부가 같은 문구로
나오면 구분되지 않고, 어댑터가 자기 성격과 반대되는 예외를 던지면 내부와 외부 구분마저 뒤집힌다.

책임 분담(이 구조의 핵심):
  - 어댑터(벤더/엔진): 자기 에러 형태를 아래 사유 중 하나로 분류만 한다. 벤더 지식은 어댑터에 남는다.
  - 이 카탈로그: 사유마다 (내부/외부, HTTP 상태, 작업자용 한국어 안내)를 소유한다.
  - 라우터: 사유 → HTTP 로 옮기기만 한다(분기 없음).

확장:
  - 새 벤더/엔진 = 어댑터 파일 1개 + 그 안에서 분류. 이 파일은 건드리지 않는다.
  - 새 사유 = 아래 enum + _CATALOG 한 줄.
  - 상태코드는 402/502 만 쓴다. groupware BFF(`mapMarketingError`)가 이 둘에 한해 사유 문구를 그대로
    노출하기 때문. 다른 상태를 새로 쓰려면 그 BFF 표에도 항목을 추가해야 문구가 안 삼켜진다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ImageFailureOrigin(StrEnum):
    """실패의 책임 소재: 작업자가 어디를 봐야 하는지 가른다."""

    EXTERNAL = "external"
    """외부 벤더(OpenAI 등). 조직 API 키, 과금, 벤더 정책이 원인: 벤더 대시보드나 채널 모델 설정에서 조치."""

    INTERNAL = "internal"
    """자체 호스팅 엔진(ComfyUI/FLUX). 우리 GPU 호스트/서비스가 원인: 인프라에서 조치."""


class ImageFailure(StrEnum):
    """이미지 생성이 실패하는 사유. 값은 로그/디버깅용 안정 식별자."""

    # 외부 벤더
    CREDENTIAL_MISSING = "credential_missing"
    QUOTA_EXCEEDED = "quota_exceeded"
    RATE_LIMITED = "rate_limited"
    CONTENT_REJECTED = "content_rejected"
    VENDOR_UNREACHABLE = "vendor_unreachable"
    VENDOR_ERROR = "vendor_error"
    # 자체 엔진
    ENGINE_UNREACHABLE = "engine_unreachable"
    ENGINE_FAILED = "engine_failed"
    ENGINE_TIMEOUT = "engine_timeout"
    ENGINE_BUSY = "engine_busy"


@dataclass(frozen=True)
class _Spec:
    origin: ImageFailureOrigin
    status: int
    message: str
    # 외부 모델로 강등해 재시도할 가치가 있는 사유인가: 엔진이 일시적으로 못 받는 경우만 True.
    #   서비스가 이 값만 보고 강등을 결정하므로(services.py), 새 사유를 추가할 때 여기서 함께 정한다.
    #   False 인 것들: 우리 그래프/콘텐츠 문제(외부에서도 같은 결과), 이미 외부에서 난 실패(재시도 무의미).
    degradable: bool = False


_EXT = ImageFailureOrigin.EXTERNAL
_INT = ImageFailureOrigin.INTERNAL

# 사유 → (내부/외부, HTTP 상태, 작업자용 안내). 안내는 "무엇이 문제인지 + 무엇을 하면 되는지"를 담는다.
_CATALOG: dict[ImageFailure, _Spec] = {
    ImageFailure.CREDENTIAL_MISSING: _Spec(
        _EXT,
        402,
        "외부 이미지 모델의 API 키가 조직에 등록되지 않았습니다. "
        "환경설정에서 키를 등록하거나, 채널의 이미지 모델을 자체(FLUX)로 바꾸세요.",
    ),
    ImageFailure.QUOTA_EXCEEDED: _Spec(
        _EXT,
        402,
        "외부 이미지 모델 사용 한도를 초과했습니다(결제 한도). "
        "벤더 대시보드에서 한도나 크레딧을 확인하거나, 채널의 이미지 모델을 자체(FLUX)로 바꾸세요.",
    ),
    ImageFailure.RATE_LIMITED: _Spec(
        _EXT,
        502,
        "외부 이미지 모델 요청이 잠시 몰렸습니다(분당 한도). 잠시 후 다시 시도하세요.",
    ),
    ImageFailure.CONTENT_REJECTED: _Spec(
        _EXT,
        502,
        "이미지 모델이 이 장면을 거부했습니다(안전 정책). 씬 연출을 바꾸거나 외부 이미지를 가져오세요.",
    ),
    ImageFailure.VENDOR_UNREACHABLE: _Spec(
        _EXT,
        502,
        "외부 이미지 모델에 연결할 수 없습니다. 잠시 후 다시 시도하세요.",
    ),
    ImageFailure.VENDOR_ERROR: _Spec(
        _EXT,
        502,
        "외부 이미지 모델이 요청을 처리하지 못했습니다.",
    ),
    ImageFailure.ENGINE_UNREACHABLE: _Spec(
        _INT,
        502,
        "자체 이미지 엔진에 연결할 수 없습니다(미기동/네트워크). 잠시 후 다시 시도하세요.",
        degradable=True,
    ),
    ImageFailure.ENGINE_FAILED: _Spec(
        _INT,
        502,
        "자체 이미지 엔진이 생성에 실패했습니다.",
    ),
    ImageFailure.ENGINE_TIMEOUT: _Spec(
        _INT,
        502,
        "자체 이미지 엔진 생성이 시간 내에 끝나지 않았습니다. 잠시 후 다시 시도하세요.",
        degradable=True,
    ),
    # 위(TIMEOUT)와 다르다: 내 작업이 느린 게 아니라 **차례가 오지 않은** 것이다. 엔진은 정상이며
    # 조치도 다르다(기다리기 vs 엔진 점검). 그래서 같은 502 라도 사유를 나눈다.
    ImageFailure.ENGINE_BUSY: _Spec(
        _INT,
        502,
        "자체 이미지 엔진이 혼잡합니다(다른 작업이 밀려 차례를 기다리는 중). 잠시 후 다시 시도하세요.",
        degradable=True,
    ),
}


def is_degradable(failure: ImageFailure) -> bool:
    """이 사유는 외부 모델로 강등해 재시도할 가치가 있나: 카탈로그가 사유별로 소유한다.

    서비스가 자기 목록을 따로 들지 않게 하려고 함수로 노출한다(사유를 추가하면 여기 한 줄로 결정된다).
    """
    return _CATALOG[failure].degradable


class ImageGenerationFailedError(Exception):
    """이미지 생성 실패: 사유(카탈로그)를 들고 다닌다. 이미지 어댑터는 이 예외만 던진다.

    detail 은 벤더/엔진 원문(진단용)이다. 사용자 문구(message)에는 붙이지 않는다. 카탈로그의 안내가
    이미 조치를 알려주고, 원문은 서버 로그로 남긴다. 단 분류되지 않은 사유(VENDOR_ERROR/ENGINE_FAILED)는
    원문 없이는 진단이 불가능해 예외적으로 함께 노출한다.
    """

    def __init__(self, failure: ImageFailure, detail: str = "") -> None:
        self.failure = failure
        self.detail = detail
        super().__init__(f"{failure.value}: {detail}" if detail else failure.value)

    @property
    def spec(self) -> _Spec:
        return _CATALOG[self.failure]

    @property
    def origin(self) -> ImageFailureOrigin:
        return self.spec.origin

    @property
    def status(self) -> int:
        return self.spec.status

    @property
    def degradable(self) -> bool:
        """외부 모델로 강등해 재시도할 가치가 있나: 카탈로그가 사유별로 소유한다."""
        return self.spec.degradable

    @property
    def message(self) -> str:
        """작업자에게 보일 문구. 원인이 불명확한 사유만 벤더 원문을 덧붙인다."""
        base = self.spec.message
        opaque = {ImageFailure.VENDOR_ERROR, ImageFailure.ENGINE_FAILED}
        if self.failure in opaque and self.detail:
            return f"{base} ({self.detail})"
        return base
