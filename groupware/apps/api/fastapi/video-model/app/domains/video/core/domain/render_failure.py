"""렌더 실패 사유 코드(SSOT). 프레임워크 비종속.

사유를 문장이 아니라 코드로도 남기는 이유. 잡의 `error` 는 사람이 읽는 한 줄이고 벤더 원문이 섞여
있어, 소비자(csc-marketing, 화면)가 그 문장으로 "한도인지 크레딧인지" 를 가르면 벤더가 문구를 바꾸는
날 조용히 어긋난다. 코드는 이 서버가 소유하고 소비자는 그대로 통과시켜 화면이 사유별로 다른 알림을
띄운다(같은 원칙: RenderStage). 사용자에게 보이는 문장은 화면이 코드별로 갖는다(web renderFailure).

책임 분담:
  - 어댑터(벤더 HTTP, 폴링): 자기 에러 형태를 아래 코드 중 하나로 분류만 한다.
  - 워커, 스위퍼: 코드를 콜백과 잡 행에 실을 뿐 해석하지 않는다(재시도 정책은 예외 종류가 정한다).

새 사유 = enum 한 줄. 소비자는 모르는 코드를 일반 실패로 접는다.
"""

from __future__ import annotations

from enum import StrEnum


class RenderFailure(StrEnum):
    # 분당 한도 등 시점의 문제. 스위퍼가 재큐잉하고, 되풀이되면 QUOTA_EXCEEDED 로 확정한다.
    RATE_LIMITED = "rate_limited"
    # 일일 한도 등 그날 안에 풀리지 않는 한도. 재시도하지 않는다.
    QUOTA_EXCEEDED = "quota_exceeded"
    # 벤더 크레딧, 결제 부족. 사람이 채워야 한다.
    CREDIT_EXHAUSTED = "credit_exhausted"
    # 조직 API 키 없음(라우팅, 복호화 문제 포함).
    CREDENTIAL_MISSING = "credential_missing"
    # 벤더 안전 정책이 이 장면을 거부했다. 장면을 고쳐야 한다.
    CONTENT_REJECTED = "content_rejected"
    # 그 밖의 벤더 거절(모델 중지, 잘못된 요청). 본문이 사유다.
    VENDOR_REFUSED = "vendor_refused"
    # 렌더 입력 파일이 스토리지에 없다.
    INPUT_MISSING = "input_missing"


# 스위퍼가 일일 한도를 확정할 때 잡 `error` 앞에 붙이는 문장. 워커가 남긴 벤더 원문은 그 뒤에 남는다.
#   다른 사유는 어댑터가 던진 예외 문장이 그대로 `error` 가 되므로 여기 문구가 없다.
QUOTA_EXCEEDED_MESSAGE = (
    "영상 모델의 요청 한도를 초과했습니다. 한도가 초기화된 뒤 다시 시도하거나 다른 영상 모델을 고르세요."
)


def failure_code_of(exc: BaseException) -> str | None:
    """예외에 실린 실패 사유 코드. 분류되지 않은 예외는 None(코드 없음 = 일반 실패)."""
    failure = getattr(exc, "failure", None)
    return failure.value if isinstance(failure, RenderFailure) else None
