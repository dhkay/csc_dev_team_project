"""도메인 에러 (inference 도메인): 프레임워크 비종속."""

from __future__ import annotations


class CredentialNotConfiguredError(Exception):
    """외부 provider 자격증명 미등록: 예: 조직에 Claude(Anthropic) API 키가 없음.

    inbound 어댑터(대화 라우터)가 이 예외를 사용자 메시지(SSE error)로 변환한다.
    """


class ExternalInferenceError(Exception):
    """외부 벤더 API(예: Anthropic) 오류 응답: 상태코드 + 본문 메시지를 담아 서버 로그로 남긴다.

    사용자에겐 일반 메시지를 주되(라우터), 원인 진단이 가능하도록 벤더의 에러 본문을 보존한다.
    """


class ExternalRateLimitedError(ExternalInferenceError):
    """외부 벤더가 분당 한도(429)나 과부하(529)로 거절했다. 잠시 뒤 다시 시도하면 풀린다.

    아래 크레딧 부족과 가르는 이유는 조치가 정반대이기 때문이다. 이쪽은 사람이 고칠 것이 없고,
    저쪽은 벤더 결제를 채워야 한다. 같은 문장으로 덮으면 기다리면 되는 사람에게 결제를 확인하라고 한다.
    """


class ExternalQuotaExceededError(ExternalInferenceError):
    """외부 벤더 크레딧, 결제 한도가 부족하다. 재시도로 풀리지 않고 사람이 채워야 한다."""


class InferenceEngineUnavailableError(Exception):
    """자체 호스팅 추론 엔진(vLLM/Ollama)에 연결 불가: 엔진 미기동/네트워크(SSH 터널 등) 문제.

    외부 벤더(Claude 등) 오류와 구분하기 위한 별도 타입. inbound 어댑터가 사용자에게
    "추론 엔진에 연결할 수 없습니다"로 명확히 변환한다(일반 500 대신).
    """


class InferenceEngineTimeoutError(Exception):
    """자체 호스팅 추론 엔진이 시간 내에 응답하지 않음. 엔진은 살아 있다.

    Unavailable(연결 불가)과 반드시 구분한다. vLLM(csc-ai-vllm)은 dev/staging/prod 가 함께 쓰는
    GPU 1장이고, 바쁘면 요청을 거절하는 대신 큐에 담아 느려질 뿐이다. 그 지연을 "연결할 수 없음"
    으로 보고하면 멀쩡한 엔진의 기동 상태를 뒤지게 만든다. 조치가 정반대다(기다리기/부하 확인 vs 엔진 점검).
    """
