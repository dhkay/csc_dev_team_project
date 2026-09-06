"""렌더 재시도 정책 표. 워커의 즉시 백오프와 스위퍼의 재큐잉이 같은 숫자를 봐야 한다.

값이 두 곳에 흩어지면 한쪽만 바뀐다. 첫 대기가 분당 창을 겨냥한다는 근거는 재큐잉 간격이 그 창을
넘긴다는 사실과 짝이라, 둘을 한 표에 두고 그 표의 계산만 여기서 잠근다.
"""

from __future__ import annotations

from app.domains.video.core.domain.retry_policy import RENDER_RETRY_POLICY, RetryPolicy


class TestBackoffDelay:
    def test_follows_the_schedule_then_repeats_the_last_step(self) -> None:
        policy = RetryPolicy(rate_limit_backoff_s=(10.0, 20.0))
        assert [policy.backoff_delay(i) for i in range(4)] == [10.0, 20.0, 20.0, 20.0]

    def test_prefers_the_vendors_retry_after(self) -> None:
        """벤더가 말한 대기가 표보다 정확하다. 표는 벤더가 말하지 않을 때의 추정이다."""
        assert RENDER_RETRY_POLICY.backoff_delay(0, retry_after_s=7.0) == 7.0

    def test_caps_a_long_retry_after(self) -> None:
        """벤더가 한 시간을 말해도 한 시도 안에서 그만큼 기다리지 않는다. 그 판정은 스위퍼의 것이다."""
        policy = RetryPolicy(max_retry_after_s=120.0)
        assert policy.backoff_delay(0, retry_after_s=3600.0) == 120.0

    def test_ignores_a_non_positive_retry_after(self) -> None:
        assert RENDER_RETRY_POLICY.backoff_delay(1, retry_after_s=0.0) == 20.0


class TestRateLimitPersists:
    def test_needs_the_requeue_budget_spent(self) -> None:
        """재큐잉을 한 번 돌려 본 뒤에도 같은 코드면 일일 한도다. 그 전에는 시점 문제일 수 있다."""
        policy = RetryPolicy(rate_limit_requeue_budget=1)
        assert policy.rate_limit_persists(0) is False
        assert policy.rate_limit_persists(1) is True


def test_defaults_are_the_numbers_the_docs_describe() -> None:
    """문서와 env 주석이 이 숫자들을 말한다. 바꾸면 그 글도 함께 바꾼다."""
    assert RENDER_RETRY_POLICY.rate_limit_backoff_s == (10.0, 20.0, 40.0, 60.0)
    assert RENDER_RETRY_POLICY.rate_limit_retries == 4
    assert RENDER_RETRY_POLICY.max_resume_attempts == 10
    assert RENDER_RETRY_POLICY.rate_limit_requeue_budget == 1
