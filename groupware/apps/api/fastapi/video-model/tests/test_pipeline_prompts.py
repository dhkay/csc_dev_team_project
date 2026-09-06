"""파이프라인 프롬프트 서술 계약: 서빙하는 값 == 실제로 provider 에 주입하는 값.

소비자(csc-marketing 프로세스 화면)는 이제 값을 베끼지 않고 `GET /pipeline/prompts` 를 받아 쓴다.
그러니 서빙 경로와 주입 경로가 같은 상수에서 나오는지가 이 파일이 지키는 계약이다.
둘이 갈라지면 화면이 조용히 거짓말한다. 여기서 깨지게 한다.
"""

from __future__ import annotations

from app.domains.video.adapters.inbound.http import mappers
from app.domains.video.adapters.outbound.processing import compose
from app.domains.video.core.domain.prompts import (
    SCENE_DIALOGUE_PROMPT,
    SCENE_MOTION_PROMPT,
    SCENE_NARRATION_PROMPT,
    build_scene_speech_directive,
)


def test_서빙하는_씬모션_프롬프트가_실제_주입값과_같다() -> None:
    served = mappers.to_pipeline_prompts_response()

    # compose 가 provider 파라미터로 넣는 바로 그 문자열.
    assert served.scene_motion.content == compose._MOTION_PROMPT
    assert served.scene_motion.content == SCENE_MOTION_PROMPT.content


def test_served_dialogue_prompt_matches_the_injected_one() -> None:
    """서빙하는 대사 지시가 실제로 프롬프트에 붙는 문구와 같다.

    이 문구의 주인이 이 서버인 이유는 벤더 계약이기 때문이다(영상 모델은 대사를 별도 필드로 받지
    않는다). 소비자가 그것을 베껴 두면 여기를 고쳐도 화면은 옛 값을 보여준다.
    """
    served = mappers.to_pipeline_prompts_response()
    assert served.scene_dialogue.content == SCENE_DIALOGUE_PROMPT.content
    # 서술의 `{line}` 자리에 그 씬의 대화내용이 들어간다. 조립 결과가 서술과 같은 틀이어야 한다.
    assert build_scene_speech_directive("안녕하세요") == served.scene_dialogue.content.format(
        line="안녕하세요"
    )


def test_served_narration_prompt_matches_the_injected_one() -> None:
    """서빙하는 나레이션 지시가 실제로 프롬프트에 붙는 문구와 같다.

    대사만 서빙하던 동안 소비자 화면에는 나레이션 경로가 아예 없었다. 기획이 그 필드를 채워
    벤더까지 보내고 있어도 화면은 대사 지시 하나만 보여줘, 나레이션으로 만든 영상은 어디서
    비롯됐는지 읽을 자리가 없었다.
    """
    served = mappers.to_pipeline_prompts_response()
    assert served.scene_narration.content == SCENE_NARRATION_PROMPT.content
    assert build_scene_speech_directive("", "밀착력이 다릅니다") == (
        served.scene_narration.content.format(line="밀착력이 다릅니다")
    )


def test_speech_directive_is_empty_without_a_line() -> None:
    """말할 문장이 없으면 붙일 지시도 없다. 빈 문장을 넣으면 침묵하라는 지시가 나간다."""
    assert build_scene_speech_directive("") == ""
    assert build_scene_speech_directive("   ", "  ") == ""


def test_narration_directive_says_the_person_does_not_speak() -> None:
    """나레이션은 화면 밖 목소리다.

    구분을 적지 않으면 모델이 나레이션까지 인물에게 말하게 해, 화면 밖 목소리로 의도한 문장이
    등장인물의 대사가 된다. 그 결과는 화면을 봐야만 드러난다.
    """
    directive = build_scene_speech_directive("", "촉촉함이 하루 종일 남습니다")
    assert directive == SCENE_NARRATION_PROMPT.content.format(line="촉촉함이 하루 종일 남습니다")
    assert "화면 속 인물이 말하지 않는다" in directive


def test_both_speech_kinds_are_ordered_so_they_do_not_overlap() -> None:
    """한 씬에 둘 다 있으면 겹치지 않게 차례로 들려야 한다.

    겹치면 둘 다 알아듣지 못한다. 두 문장을 그냥 나란히 적으면 모델이 동시에 내는 쪽을 고른다.
    """
    directive = build_scene_speech_directive("이거 좋네요", "밀착력이 다릅니다")
    assert "이거 좋네요" in directive and "밀착력이 다릅니다" in directive
    assert "겹치지 않게" in directive


def test_서빙값이_한국어_한_벌이다() -> None:
    # 프롬프트는 한 벌이다: 주입하는 그 문자열이 그대로 화면에 나간다(번역본을 따로 두지 않는다).
    served = mappers.to_pipeline_prompts_response()
    content = served.scene_motion.content
    assert content.strip()
    assert any("가" <= ch <= "힣" for ch in content)


def test_파이프라인_라우트가_앱에_등록돼_있다() -> None:
    # 라우터를 만들고 include 를 빠뜨리면 소비자는 조용히 폴백값을 계속 쓴다.
    from app.domains.video.adapters.inbound.http.router import pipeline_router

    assert [r.path for r in pipeline_router.routes] == ["/pipeline/prompts"]
