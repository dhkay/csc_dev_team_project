"""사고 정책 도메인 테스트: 사고가 도는지의 판단과 그것이 출력 예산에 미치는 영향.

와이어 형식(어댑터)과 예산(요청 조립)이 같은 판단을 공유하는지가 핵심이다. 두 곳이 갈리면
사고는 도는데 예산은 답만큼만 잡히는 조합이 생기고, 그때 본문이 사라진다.
"""

from __future__ import annotations

from app.domains.inference.core.domain.thinking import (
    ThinkingControl,
    output_budget,
    thinking_runs,
)


def test_thinking_runs_reads_the_model_form_not_only_the_intent() -> None:
    """의도만으로 정하지 않는다. 그 모델이 그 형식을 받는지가 함께 결정한다."""
    # 끌 수 있는 모델: 요청이 정한다.
    assert thinking_runs(ThinkingControl.TOGGLE, True) is True
    assert thinking_runs(ThinkingControl.TOGGLE, False) is False
    assert thinking_runs(ThinkingControl.TOGGLE, None) is False  # 기본 off

    # 생략형 모델: 켜 달라고 해도 켤 방법이 없다(haiku 는 adaptive 를 400 으로 거절).
    assert thinking_runs(ThinkingControl.OMIT, True) is False

    # 끌 수 없는 등급: 요청과 무관하게 돈다. 예산이 이 사실을 알아야 한다.
    assert thinking_runs(ThinkingControl.FORCED, False) is True


def test_output_budget_clamps_to_the_model_window() -> None:
    """출력 토큰 상한은 모델을 아는 쪽이 정한다.

    호출자(csc-marketing)가 남의 모델 창을 추측해 상수로 박으면, 창이 큰 모델(Claude)까지 가장 작은
    모델에 맞춰 손해를 본다. 실제로 고정 6000 탓에 기획안 4개 이상이 잘려 파싱이 깨졌다.
    이제 호출자는 필요한 만큼 요청하고, 창을 넘는지는 카탈로그의 max_output_tokens 로 여기서 깎는다.
    """
    # 상한이 있는 모델(자체 vLLM: 창 6000): 넘겨 보내면 엔진이 400 이라 깎는다.
    assert output_budget(20000, thinking=False, window=6000) == 6000
    assert output_budget(3000, thinking=False, window=6000) == 3000  # 상한 아래면 그대로

    # 상한 미선언(외부 벤더 등 창이 넉넉): 요청 그대로 통과해야 한다(작은 모델에 끌려가지 않는다).
    assert output_budget(20000, thinking=False, window=None) == 20000

    # 요청 없음 = 엔진/어댑터 기본값에 맡긴다.
    assert output_budget(None, thinking=False, window=6000) is None
    assert output_budget(None, thinking=False, window=None) is None


def test_output_budget_gives_the_whole_window_when_thinking_runs() -> None:
    """사고가 돌면 창 전체를 준다. 답 예산 위에 상수를 얹는 방식은 보장이 되지 못한다.

    적응형 사고는 과제가 아니라 주어진 예산에 맞춰 늘어난다(실측: 예산 1024 → 사고 1022 본문 0,
    예산 9024 → 사고 9022 본문 0). 그래서 얼마를 얹어도 같은 실패가 남고, 넓게 잡아 잃는 것도
    없다(청구는 생성된 토큰만).
    """
    # 호출자가 답 기준으로 적게 요청했더라도 사고가 돌면 그 값에 갇히지 않는다.
    assert output_budget(1024, thinking=True, window=64000) == 64000
    assert output_budget(None, thinking=True, window=64000) == 64000

    # 창이 선언되지 않은 모델은 어댑터 기본값에 맡긴다(추측한 숫자를 넣지 않는다).
    assert output_budget(10000, thinking=True, window=None) is None
