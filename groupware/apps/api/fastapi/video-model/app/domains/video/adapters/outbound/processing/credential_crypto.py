"""잡 params 로 전달된 조직 크레덴셜(예: xAI 키) 복호화.

csc-marketing 이 조직 키를 AES-256-GCM 으로 암호화해 COMPOSE 잡 params(`scene_visual_credential`)에 싣고,
워커가 사용 직전 이걸로 복호화해 Bearer 로만 쓴다(평문은 어디에도 영속되지 않는다. DB/redis 엔 암호문만).

포맷(csc-groupware AesGcmSecretCipher 와 동일): `base64(iv).base64(tag).base64(ciphertext)`, iv=12B, tag=16B.
키 = sha256(SERVICE_TOKEN_SECRET) 32바이트: 전 서버 공유 시크릿에서 파생(양측 동일 유도). 전용 시크릿 분리는 후속.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def decrypt_credential(payload: str, secret: str) -> str:
    """`iv.tag.ciphertext`(각 base64) → 평문. 형식/복호화 실패는 ValueError."""
    parts = payload.split(".")
    if len(parts) != 3:
        raise ValueError("손상된 크레덴셜 암호문 형식")
    iv, tag, ct = (base64.b64decode(p) for p in parts)
    # AESGCM 은 ciphertext||tag 를 기대: csc-marketing 은 tag 를 분리 저장하므로 여기서 다시 합친다.
    try:
        plain = AESGCM(_key(secret)).decrypt(iv, ct + tag, None)
    except Exception as exc:  # noqa: BLE001 - 인증 실패/키 불일치 등.
        raise ValueError(f"크레덴셜 복호화 실패: {exc}") from exc
    return plain.decode("utf-8")
