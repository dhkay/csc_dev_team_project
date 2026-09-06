"""잡 params 크레덴셜 복호화 단위: 포맷/왕복/변조 검출.

포맷은 csc-marketing 암호화(Node createCipheriv aes-256-gcm)와 동일: base64(iv).base64(tag).base64(ct),
키=sha256(SERVICE_TOKEN_SECRET). 여기선 Python 왕복으로 decrypt 로직/포맷을 검증한다(교차언어 벡터는 별도).
"""

from __future__ import annotations

import base64
import hashlib
import os

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.domains.video.adapters.outbound.processing.credential_crypto import decrypt_credential

_SECRET = "shared-service-secret"


def _encrypt(plain: str, secret: str) -> str:
    """csc-marketing 포맷을 미러한 테스트용 암호화(iv.tag.ct, tag 분리)."""
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    iv = os.urandom(12)
    combined = AESGCM(key).encrypt(iv, plain.encode("utf-8"), None)  # ct||tag(16)
    body, tag = combined[:-16], combined[-16:]
    return ".".join(base64.b64encode(x).decode("ascii") for x in (iv, tag, body))


def test_roundtrip() -> None:
    token = _encrypt("xai-abc123", _SECRET)
    assert decrypt_credential(token, _SECRET) == "xai-abc123"


def test_wrong_secret_fails() -> None:
    token = _encrypt("xai-abc123", _SECRET)
    with pytest.raises(ValueError):
        decrypt_credential(token, "other-secret")


def test_bad_format_fails() -> None:
    with pytest.raises(ValueError):
        decrypt_credential("not-a-valid-token", _SECRET)


def test_cross_language_vector_from_node() -> None:
    """실제 csc-marketing(Node createCipheriv aes-256-gcm)이 만든 암호문을 복호화한다.

    JobCredentialCipher 와 동일 알고리즘(key=sha256(secret), iv.tag.ct base64)으로 Node 에서 1회 생성해
    고정 벡터로 박아둔 값: 교차언어 와이어 포맷 회귀 가드. IV 가 벡터에 포함돼 결정적으로 복호화된다.
    """
    node_token = (
        "9SvLXP4m1gipzD47.dNLYCXC+Hw4aZInYKMXiSA==."
        "AYqkOo1O36EDgMbB/Gu+WR2J2bQUKA=="
    )
    assert decrypt_credential(node_token, "cross-lang-shared-secret") == "xai-cross-lang-키-123"
