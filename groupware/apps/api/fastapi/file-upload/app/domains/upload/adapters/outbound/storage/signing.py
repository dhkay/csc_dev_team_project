"""서명 업로드/다운로드 URL 토큰: HS256 (표준 라이브러리, PyJWT 미사용).

ServiceTokenMiddleware 와 동일한 stdlib HMAC-SHA256 방식.
- PUT(업로드): presign 이 서명, 브라우저 직접 PUT 시 검증. 클레임 {uid, key, mime, size, exp}.
- GET(다운로드): 조직 스코프로 발급된 접근토큰. 클레임 {aud:"get", uid, exp}: aud 로 PUT 과 교차사용 차단.
  발급/검증 모두 file-upload 안에서만 일어난다(BFF 는 /uploads/access-urls 로 발급받음).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

_HEADER = {"alg": "HS256", "typ": "JWT"}


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def sign(claims: dict, secret: str, ttl_seconds: int) -> str:
    payload = {**claims, "exp": int(time.time()) + ttl_seconds}
    header_b64 = _b64url_encode(json.dumps(_HEADER, separators=(",", ":")).encode())
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()
    sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(sig)}"


def sign_download(uid: str, secret: str, ttl_seconds: int) -> str:
    """다운로드(GET) 접근 토큰: 언어 중립 `{uid}.{exp}.{sig}` (sig=HMAC-SHA256("get:{uid}:{exp}")).

    web BFF(TS/node:crypto)도 동일 문자열로 서명할 수 있게 JSON 대신 고정 문자열 HMAC 을 쓴다
    (JSON 키 순서/구분자 언어차 제거). uid 는 UUID(점 없음)라 3분할이 안전하다.
    """
    exp = int(time.time()) + ttl_seconds
    sig = hmac.new(secret.encode(), f"get:{uid}:{exp}".encode(), hashlib.sha256).digest()
    return f"{uid}.{exp}.{_b64url_encode(sig)}"


def verify_download(token: str, secret: str) -> str | None:
    """다운로드 접근 토큰 검증: 유효(서명 일치 + 미만료)하면 대상 uid, 아니면 None."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    uid, exp_raw, sig_b64 = parts
    try:
        exp = int(exp_raw)
    except ValueError:
        return None
    if exp < time.time():
        return None
    expected = hmac.new(secret.encode(), f"get:{uid}:{exp}".encode(), hashlib.sha256).digest()
    try:
        actual = _b64url_decode(sig_b64)
    except (ValueError, base64.binascii.Error):
        return None
    if not hmac.compare_digest(expected, actual):
        return None
    return uid


def verify(token: str, secret: str) -> dict | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    header_b64, payload_b64, sig_b64 = parts

    signing_input = f"{header_b64}.{payload_b64}".encode()
    expected = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    try:
        actual = _b64url_decode(sig_b64)
    except (ValueError, base64.binascii.Error):
        return None
    if not hmac.compare_digest(expected, actual):
        return None

    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except (ValueError, base64.binascii.Error):
        return None

    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or exp < time.time():
        return None
    return payload
