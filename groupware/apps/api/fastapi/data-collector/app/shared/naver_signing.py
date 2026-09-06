"""네이버 검색광고 HMAC-SHA256 서명 (실사용 수집과 /lab 프로브 공용).

두 표면이 같은 API 를 서로 다른 목적으로 부른다(수집 대 진단). 서명 규칙을 각자 들고 있으면
한쪽만 고쳐진 채 다른 쪽이 401 로 죽는데, 그 401 은 자격 문제처럼 보여서 원인을 찾기 어렵다.
그래서 규칙은 여기 한 벌만 둔다.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time


def timestamp_ms() -> str:
    """밀리초 타임스탬프. 초 단위로 보내거나 컨테이너 시계가 어긋나면 403 이 난다."""
    return str(int(time.time() * 1000))


def sign(secret_key: str, ts_ms: str, method: str, path: str) -> str:
    """base64(HMAC-SHA256("{ts}.{METHOD}.{path}", secretKey)).

    함정 1: 서명 대상은 쿼리스트링을 제외한 path 뿐이다. 쿼리를 포함하면 401.
    함정 2: 서명은 오래 못 산다(실측: 30초 과거 200, 60초 과거 403). 절대 캐시하지 않고
            호출 시점에 새로 만든다.
    """
    message = f"{ts_ms}.{method}.{path}"
    digest = hmac.new(secret_key.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()
