"""서버 간 인증(Layer 3): X-Service-Token 발급/검증 (HS256).

표준 HS256 JWT 라 TS(`@csc/net-utils`) / jsonwebtoken 구현과 상호호환된다.
PyJWT 없이 표준 라이브러리(hmac/hashlib)만 사용한다.
계약: docs/specs/service-http-contract.md §1.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import time
from collections.abc import Iterable

_DEFAULT_TTL_SECONDS = 3600


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def create_service_token(
    secret: str, service: str, ttl_seconds: int = _DEFAULT_TTL_SECONDS
) -> str:
    """HS256 서비스 토큰 발급. jsonwebtoken.sign({service},secret,{HS256}) 와 동일 산출."""
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"service": service, "iat": now, "exp": now + ttl_seconds}
    signing_input = (
        _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    )
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(sig)}"


def verify_service_token(
    token: str, secret: str, allowed: Iterable[str] | None = None
) -> str | None:
    """토큰을 검증해 호출자(`service`)를 반환. 실패 시 None.

    - 서명 불일치 / 형식오류 / exp 만료 → None
    - allowed 가 주어지면 service 가 화이트리스트에 있어야 함
    """
    parts = token.split(".")
    if len(parts) != 3:
        return None
    header_b64, payload_b64, sig_b64 = parts

    signing_input = f"{header_b64}.{payload_b64}".encode()
    expected_sig = hmac.new(
        secret.encode() if isinstance(secret, str) else secret,
        signing_input,
        hashlib.sha256,
    ).digest()
    try:
        actual_sig = _b64url_decode(sig_b64)
    except (ValueError, binascii.Error):
        return None
    if not hmac.compare_digest(expected_sig, actual_sig):
        return None

    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except (ValueError, binascii.Error):
        return None

    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or exp < time.time():
        return None

    service = payload.get("service")
    if not isinstance(service, str) or not service:
        return None
    if allowed is not None and service not in set(allowed):
        return None
    return service
