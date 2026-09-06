"""렌더 재시도 정책. 숫자가 한 표에 모여 있어야 워커의 즉시 백오프와 스위퍼의 재큐잉이 한 이야기가 된다.

두 계층은 같은 실패(429)를 시간 축에서 나눠 다룬다. 워커는 분당 창을 겨냥해 그 자리에서 몇 번 다시
보내고, 그래도 안 되면 스위퍼가 재큐잉 간격(분 단위)으로 한 번 더 돌려 보고 되풀이되면 일일 한도로
확정한다. 한쪽 값을 바꾸면 다른 쪽의 근거가 흔들리므로 서로 옆에 둔다.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RetryPolicy:
    # 429 뒤 그 자리에서 다시 보내기까지의 대기(초). 시도마다 다음 값을 쓰고 끝을 넘으면 마지막 값을 반복한다.
    #   분당 창이 목표라 첫 대기가 10초다. 넷을 다 쓰면 130초를 기다린 셈이고 그래도 429 면 분당 창이 아니다.
    rate_limit_backoff_s: tuple[float, ...] = (10.0, 20.0, 40.0, 60.0)
    # 벤더가 Retry-After 로 더 긴 값을 말해도 한 시도 안에서 이 이상은 기다리지 않는다.
    max_retry_after_s: float = 120.0
    # 429 뒤 그 자리에서 다시 보내는 횟수. 벤더별 설정이 덮을 수 있다.
    rate_limit_retries: int = 4
    # 스위퍼 재큐잉 상한. 재큐잉은 체크포인트로 이어 하지만 매번 죽는 잡이 영원히 돌지 않게 둔다. 넘으면 FAILED.
    max_resume_attempts: int = 10
    # 429 코드로 멎은 잡을 한 번 더 돌려 보는 재큐잉 예산. 재큐잉 간격이 분당 창을 넘기므로 한 번이면
    #   시점 문제였는지 드러난다. 그 뒤에도 같은 코드면 그날 안에 풀리지 않는 한도라 QUOTA_EXCEEDED 로 확정한다.
    rate_limit_requeue_budget: int = 1

    def backoff_delay(self, attempt: int, retry_after_s: float | None = None) -> float:
        """attempt 번째(0부터) 429 뒤 기다릴 초. 벤더의 Retry-After 가 있으면 상한 안에서 그것을 따른다."""
        if retry_after_s is not None and retry_after_s > 0:
            return min(retry_after_s, self.max_retry_after_s)
        steps = self.rate_limit_backoff_s
        return steps[min(attempt, len(steps) - 1)]

    def rate_limit_persists(self, attempts: int) -> bool:
        """재큐잉을 예산만큼 하고도 마지막 시도가 한도에 걸렸는가. 스위퍼가 일일 한도로 확정하는 조건."""
        return attempts >= self.rate_limit_requeue_budget


RENDER_RETRY_POLICY = RetryPolicy()
