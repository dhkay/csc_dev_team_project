"""csc 서버 간 HTTP 통신 공유 유틸 (Python 측 단일 구현).

계약 단일 진실원: docs/specs/service-http-contract.md
TS 측 동일 구현: packages/net-utils (@csc/net-utils)

httpx 기반 아웃바운드 클라이언트는 `csc_net_utils.http_client` 에서 명시적으로 import 한다
(httpx 미설치 앱에서 import 되지 않도록 여기서 노출하지 않음).
"""

from .identity import Identity, get_identity
from .middleware import (
    DEFAULT_EXEMPT_PREFIXES,
    CorrelationIdMiddleware,
    ServiceTokenMiddleware,
    require_services,
)
from .request_context import (
    REQUEST_ID_HEADER,
    TRACE_ID_HEADER,
    RequestContext,
    get_request_context,
    get_request_id,
    get_trace_id,
)
from .service_token import create_service_token, verify_service_token

# 공개 계약. 내부 구현(id 생성/정규화/컨텍스트 주입)은 여기 넣지 않는다. 미들웨어와
# 아웃바운드 클라이언트가 쓰는 배관이라 공개하면 계약만 넓어지고 우회 사용을 부른다.
# 필요하면 `csc_net_utils.request_context` 에서 직접 import (테스트가 그렇게 한다).
__all__ = [
    # 서비스 토큰
    "create_service_token",
    "verify_service_token",
    # 미들웨어
    "ServiceTokenMiddleware",
    "CorrelationIdMiddleware",
    "require_services",
    "DEFAULT_EXEMPT_PREFIXES",
    # 상관관계: 읽기(로그/에러 리포팅 호출부가 현재 trace 를 집어갈 때)
    "RequestContext",
    "TRACE_ID_HEADER",
    "REQUEST_ID_HEADER",
    "get_request_context",
    "get_trace_id",
    "get_request_id",
    # 신원
    "Identity",
    "get_identity",
]
