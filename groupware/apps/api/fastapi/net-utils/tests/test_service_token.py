"""csc_net_utils 서비스 토큰 발급/검증 테스트.
TS `@csc/net-utils` 와 동일 계약을 검증한다. 계약: docs/specs/service-http-contract.md §1.
"""

from csc_net_utils import create_service_token, verify_service_token


def test_발급한_토큰을_같은_시크릿으로_검증하면_service_반환():
    token = create_service_token("secret", "csc-groupware")
    assert verify_service_token(token, "secret") == "csc-groupware"


def test_다른_시크릿이면_None():
    token = create_service_token("secret", "csc-groupware")
    assert verify_service_token(token, "wrong") is None


def test_allowed_화이트리스트_검사():
    token = create_service_token("secret", "stranger")
    assert verify_service_token(token, "secret", ["csc-groupware", "user"]) is None
    ok = create_service_token("secret", "user")
    assert verify_service_token(ok, "secret", ["csc-groupware", "user"]) == "user"


def test_만료된_토큰은_None():
    token = create_service_token("secret", "user", ttl_seconds=-10)
    assert verify_service_token(token, "secret") is None


def test_형식오류_토큰은_None():
    assert verify_service_token("not-a-jwt", "secret") is None
    assert verify_service_token("a.b.c.d", "secret") is None


def test_표준_HS256_헤더():
    import base64
    import json

    header_b64 = create_service_token("secret", "user").split(".")[0]
    padding = "=" * (-len(header_b64) % 4)
    header = json.loads(base64.urlsafe_b64decode(header_b64 + padding))
    assert header == {"alg": "HS256", "typ": "JWT"}
