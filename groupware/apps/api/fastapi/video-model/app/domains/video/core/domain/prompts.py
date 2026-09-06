"""video-model 이 provider 에 보내는 프롬프트 SSOT.

이 서버가 원문의 주인이다. 어댑터의 private 상수로 두면 소비자가 그 값을 베껴 두고, 여기를
고쳤을 때 저쪽이 조용히 옛 값을 보여준다.

도메인 상수로 올려서
  - 실제 호출  : compose.py 가 provider 파라미터로 주입
  - 외부 서술  : `GET /pipeline/prompts` 가 그대로 내려줌 (소비자가 복제하지 않는다)
둘 다 여기서 파생한다. 프롬프트를 고치면 소비자 화면이 따라온다.

프롬프트는 한 벌이다. 저장된 그 값이 그대로 provider 에 나가고 그대로 소비자 화면에 보인다.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PromptDescriptor:
    """provider 로 나가는 프롬프트 1개. 이 값이 그대로 나가고 그대로 보인다."""

    content: str


# 씬 비주얼 모션 힌트: AI 모션 provider(자체 Wan I2V / 외부 Grok Imagine)에 은은한 자연 모션을 유도.
#   provider 무관 같은 값을 넣는다(compose.py `_render_visual` 의 vparams["prompt"]).
#   slideshow 는 무시한다(정지 이미지 그대로).
#   씬 이미지가 있을 때만 쓰인다. 이미지가 화면을 이미 정했으므로 프롬프트는 움직임만 지시한다.
#   이미지가 없는 텍스트→영상 경로에서는 씬의 화면 묘사가 그 자리를 대신한다.
SCENE_MOTION_PROMPT = PromptDescriptor(
    content="은은한 자연스러운 모션, 부드러운 카메라 움직임, 시네마틱, 고품질",
)

# 말 지시: 그 씬에서 누가 무엇을 말하는지를 벤더 프롬프트에 적는 문구.
#
#   이 문구의 주인이 이 서버인 이유는 벤더 계약이기 때문이다. 영상 모델은 대사를 별도 필드로
#   받지 않는다(Higgsfield 요청 본문은 prompt/duration/aspect_ratio 뿐이다). 말은 프롬프트 안에
#   따옴표로 적어야 발화된다. 그 표기법은 모델을 부르는 쪽이 아는 것이고, 호출자(csc-marketing)는
#   "이 씬에서 이 문장을 말한다" 까지만 안다.
#
#   말은 두 종류이고 한 씬에 함께 있을 수 있다. 둘 다 이 모델이 낸다.
#     dialogue   화면 속 인물이 하는 말 → 입 모양을 맞춰야 한다
#     narration  화면 밖에서 읽는 문장 → 인물의 입은 움직이지 않아야 한다
#   구분을 프롬프트에 적지 않으면 모델이 나레이션까지 인물에게 말하게 해, 화면 밖 목소리로 의도한
#   문장이 등장인물의 대사가 된다.
#
#   문장 자체는 손대지 않는다(작은따옴표로 감싸지 않고 큰따옴표를 쓰는 이유: 한국어 대사에
#   작은따옴표가 흔하다).
SCENE_DIALOGUE_PROMPT = PromptDescriptor(
    content='화면 속 인물이 또렷한 한국어로 다음 대사를 말한다: "{line}". 입 모양을 대사에 정확히 맞춘다.',
)

SCENE_NARRATION_PROMPT = PromptDescriptor(
    content=(
        '화면 밖 목소리가 또렷한 한국어로 다음 문장을 읽는다: "{line}".'
        " 이 문장은 화면 속 인물이 말하지 않는다."
    ),
)

# 둘이 함께 있는 씬: 겹쳐 들리면 둘 다 알아듣지 못한다. 순서를 지시로 못박는다.
SCENE_SPEECH_ORDER_PROMPT = PromptDescriptor(
    content="두 목소리는 겹치지 않게 차례로 들린다.",
)


def build_scene_speech_directive(dialogue: str, narration: str = "") -> str:
    """대사/나레이션 → 벤더 프롬프트에 붙일 지시.

    넷 중 하나다: 대사만 / 나레이션만 / 둘 다 / 둘 다 없음(빈 문자열). 빈 문자열이면 호출부가
    붙일 것이 없다고 읽는다.
    """
    said = (dialogue or "").strip()
    read = (narration or "").strip()

    parts: list[str] = []
    if said:
        parts.append(SCENE_DIALOGUE_PROMPT.content.format(line=said))
    if read:
        parts.append(SCENE_NARRATION_PROMPT.content.format(line=read))
    if said and read:
        parts.append(SCENE_SPEECH_ORDER_PROMPT.content)
    return " ".join(parts)
