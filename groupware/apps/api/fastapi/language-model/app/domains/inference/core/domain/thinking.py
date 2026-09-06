"""사고(thinking) 정책: 모델이 받는 형식과 그것이 출력 예산에 미치는 영향.

두 계층이 같은 판단을 한다. 벤더 어댑터는 "요청에 무엇을 실을까", 요청을 만드는 쪽은 "예산을
얼마로 잡을까" 를 정하는데 둘 다 사고가 도는지에 달려 있다. 두 곳에서 각자 판단하면 한쪽만
바뀌어 어긋난다.

와이어 형식이 모델마다 달라 불리언으로 표현되지 않는다(실측 2026-09-02, 조직 등록 키):

    claude-sonnet-5             disabled 200   adaptive 200
    claude-opus-4-8             disabled 200   adaptive 200
    claude-haiku-4-5-20251001   disabled 200   adaptive 400 "adaptive thinking is not supported"

그래서 형식은 모델의 사실이고 카탈로그(`ModelSpecRecord.thinking`)가 소유한다. 어댑터는 그 값을
옮길 뿐이라 모델이 늘어도 어댑터를 고치지 않는다.

자체 호스팅 모델(Qwen3 등)이 OMIT 인 것은 누락이 아니다. 벤더가 받는 사고 파라미터가 없고 채팅
템플릿(`chat_template_kwargs.enable_thinking`)으로 제어하는 것이 그 모델의 사실이다.

사고를 켤 수 있는 경로는 스트리밍뿐이다. 고정 스키마를 동기로 받는 `/inference/generate` 는 사고
의도를 받지 않는다. 사고가 예산만큼 길어지면 타임아웃 사다리(어댑터 240초)를 넘기고, 넘긴 요청은
답도 사고도 남기지 않는다. 그 경로에 사고를 들이려면 잡으로 돌려야 한다.
"""

from __future__ import annotations

from enum import Enum


class ThinkingControl(str, Enum):
    """이 모델의 사고를 어떻게 제어하는가. 벤더가 받는 형식이라 실측으로 정한다."""

    OMIT = "omit"
    """사고 파라미터를 보내지 않는다. 생략하면 꺼지는 모델, 또는 사고가 없는 모델의 기본값."""

    TOGGLE = "toggle"
    """끌 때 disabled, 켤 때 adaptive 를 보낸다. 생략하면 켜지므로 끌 때도 명시해야 한다."""

    FORCED = "forced"
    """끌 수 없는 등급. 보낼 값이 없어 파라미터를 생략하고, 예산은 창 전체를 받는다."""


def thinking_runs(control: ThinkingControl, enable_thinking: bool | None) -> bool:
    """이 조합에서 사고가 실제로 도는가.

    끌 수 없는 등급은 요청과 무관하게 돌고, 생략형 모델은 켜 달라고 해도 돌지 않는다(그 형식으로
    켤 방법이 없다). 그 사실을 예산과 와이어가 함께 쓴다.
    """
    if control is ThinkingControl.FORCED:
        return True
    if control is ThinkingControl.TOGGLE:
        return bool(enable_thinking)
    return False


def output_budget(
    requested: int | None,
    *,
    thinking: bool,
    window: int | None,
) -> int | None:
    """벤더에 보낼 출력 토큰. 호출자의 값은 답에 필요한 토큰이라는 뜻이다.

    사고 토큰은 답과 같은 주머니에서 먼저 빠진다. 그래서 사고가 도는 요청에는 호출자의 값에 무엇을
    얹는 대신 창 전체를 준다. 얼마를 얹어야 하는지 계산할 방법이 없기 때문이다(아래 실측).
    창이 선언되지 않은 모델은 어댑터 기본값에 맡긴다(None).

    사고가 없으면 요청을 창으로만 깎는다. 호출자는 필요한 만큼 말하고, 창은 모델을 아는 쪽이 안다.
    창을 넘겨 보내면 엔진과 벤더가 400 으로 거절한다.

        예산 1024 → 사고 1022, 본문 0자
        예산 9024 → 사고 9022, 본문 0자
    적응형 사고는 과제가 아니라 주어진 예산에 맞춰 늘어난다. 답 예산 위에 상수를 얹는 방식은
    그래서 보장이 되지 못하고(둘 다 본문 0), 얼마를 얹어도 같은 실패가 남는다. 넓게 잡아 잃는 것도
    없다: 청구는 실제 생성된 토큰에만 붙는다.
    """
    if thinking:
        return window
    if requested is None or window is None:
        return requested
    return min(requested, window)
