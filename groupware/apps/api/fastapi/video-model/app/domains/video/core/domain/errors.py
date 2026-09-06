"""도메인 예외 (video 도메인). 프레임워크 비종속: FastAPI/SQLAlchemy 를 import 하지 않는다."""

from __future__ import annotations

from .render_failure import RenderFailure


class RenderError(RuntimeError):
    """실패 사유 코드(`failure`)를 들고 다니는 렌더 예외의 공통 조상.

    코드는 선택이다. 분류되지 않은 실패(ffmpeg 오류 등)는 None 으로 두고, 워커는 그것을 코드 없는
    일반 실패로 보고한다. 하위 클래스는 자기 기본 코드를 클래스 속성으로 두고, 어댑터가 더 정확히
    알면 생성 시 덮는다(예: 벤더 거절 중 크레딧 부족).
    """

    failure: RenderFailure | None = None

    def __init__(self, message: str, failure: RenderFailure | None = None) -> None:
        super().__init__(message)
        if failure is not None:
            self.failure = failure


class PermanentRenderError(RenderError):
    """재시도해도 절대 성공하지 않는 실패: 입력이 사라졌거나 잡 자체가 잘못됐다.

    이걸 일반 실패와 구분하는 이유는 재시도 예산이다. 스위퍼는 죽은 잡을 최대 10번 부활시키는데,
    그건 '워커가 죽어서 못 끝냈다' 를 위한 예산이다. 입력 이미지가 스토리지에서 사라진 잡은 열 번을
    돌려도 같은 404 를 받으므로, 그 시간 동안 화면은 '만드는중' 이고 큐만 소모된다.
    이 예외는 워커가 즉시 FAILED 로 확정해 사용자가 바로 원인을 보게 한다.
    """


class MissingRenderInputError(PermanentRenderError):
    """렌더 입력 파일(씬 이미지/BGM/효과음)이 스토리지에 없다(404).

    업로드 전 참조나 사후 삭제/정리로 발생한다. 생성 시점의 사전검증(assertAssetsUploaded)을
    통과했더라도 그 뒤에 지워질 수 있으므로 렌더 시점에도 이 경우가 존재한다.
    """

    failure = RenderFailure.INPUT_MISSING


class VendorRefusedError(PermanentRenderError):
    """유료 벤더가 요청을 거절했고, 같은 요청은 계속 거절된다.

    모델이 벤더에서 사용 중지됐거나, 크레딧이 없거나, 키가 잘못됐거나, 본문이 유효하지 않은 경우다.
    재시도가 무의미하다는 점에서 입력 소실과 같은 부류라 PermanentRenderError 를 상속한다.

    별도 이름을 두는 이유는 원인의 출처가 다르기 때문이다. 입력 소실은 우리 스토리지의 사실이고
    이건 벤더 계정의 사실이라, 고치는 사람도 고치는 곳도 다르다(코드가 아니라 벤더 콘솔).
    메시지에는 벤더가 준 본문을 그대로 싣는다(adapters/outbound/processing/vendor_http.py).
    """

    failure = RenderFailure.VENDOR_REFUSED


class VendorTransientError(RenderError):
    """유료 벤더가 "나중에" 라고 답했다(한도, 일시 차단, 5xx). 스위퍼가 재큐잉한다.

    한도(429)는 RATE_LIMITED 코드를 싣는다. 스위퍼는 그 코드가 재큐잉 뒤에도 되풀이되면 일일 한도로
    보고 QUOTA_EXCEEDED 로 확정한다(5분 간격 재시도가 분당 창은 넘기지만 하루 창은 못 넘긴다).
    """

    # 벤더가 Retry-After 로 말한 대기(초). 재시도하는 쪽이 백오프 표보다 이 값을 우선한다. 없으면 None.
    retry_after_s: float | None = None

    def __init__(
        self,
        message: str,
        failure: RenderFailure | None = None,
        *,
        retry_after_s: float | None = None,
    ) -> None:
        super().__init__(message, failure)
        self.retry_after_s = retry_after_s


class DuplicateClientRequestError(RuntimeError):
    """같은 멱등키의 잡이 이미 있다(부분 유니크 위반).

    저장소가 DB 충돌을 이 이름으로 번역한다. core 는 SQLAlchemy 를 모르므로 드라이버 예외를 그대로
    올리면 서비스가 그것을 잡을 수 없고, 잡으려면 core 가 ORM 을 알게 된다.
    """


class DeadVisualHandleError(RenderError):
    """외부 렌더 handle 이 영구히 사용 불가함. 벤더가 그 요청을 실패/만료로 확정했다.

    COMPOSE 재개 설계는 제출 직후 handle(prompt_id)을 영속해, 워커가 죽어도 다음 실행이 재폴링으로
    결과를 회수한다(GPU/과금 재작업 0). 그런데 벤더가 그 요청 자체를 실패로 확정한 경우에는 재폴링이
    영원히 같은 실패를 되풀이한다. 스위퍼가 재큐잉 한도(10회)를 다 쓰는 동안 화면은 계속 '만드는중' 이고,
    실제로 xAI 의 일시 저장 실패 한 건이 그렇게 이틀을 소모했다.

    그래서 '이 handle 은 죽었다'를 일반 실패와 구분해 던진다. 받는 쪽(compose)은 그 씬의 handle 만
    버리고 재던지므로, 다음 시도가 새로 제출해 실제로 복구된다. 완성된 다른 씬과 청구 초는 보존된다.
    안전 필터 차단처럼 사유를 아는 경우에만 코드(CONTENT_REJECTED)를 싣는다.
    """
