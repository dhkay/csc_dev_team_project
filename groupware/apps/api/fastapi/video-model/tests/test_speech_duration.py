"""대화내용 → 말하는 시간 추정.

이 값이 나레이션을 끈 씬의 요청 길이 그 자체가 된다. 그 경로는 받아온 클립을 자르지도 늘리지도
않으므로(발화가 클립 안에서 끝나 있다), 여기서 모자라게 잡으면 벤더가 말이 끝나지 않는 클립을
만들고 그대로 최종본에 실린다. 화면은 멀쩡하고 사람이 말하다 만다.

특정 숫자를 잠그지 않는다. 초당 음절 속도는 실제 결과를 보고 조정할 값이라, 그 값에 테스트를
묶으면 조정할 때마다 테스트를 함께 고치게 되고 그러면 테스트가 아무것도 지키지 않는다. 대신 조정해도
성립해야 하는 성질을 잠근다: 말이 없으면 0, 길수록 길다, 말해지지 않는 문자는 세지 않는다.
"""

from app.domains.video.adapters.outbound.processing.speech_duration import (
    estimate_speech_seconds,
    speech_units,
)


class TestNoSpeech:
    def test_empty_text_is_zero(self) -> None:
        """말이 없으면 0을 돌려준다(호출부가 기본 길이를 쓰도록)."""
        # 여기서 기본값을 돌려주면 "말이 없다" 와 "아주 짧게 말한다" 가 같은 값이 되어
        #   호출부가 둘을 구분하지 못한다.
        assert estimate_speech_seconds("") == 0.0

    def test_whitespace_and_punctuation_only_is_zero(self) -> None:
        """공백과 문장부호만 있으면 말해지는 것이 없다."""
        assert estimate_speech_seconds("  ...  !? ") == 0.0


class TestSpeechUnits:
    def test_punctuation_and_spaces_are_not_counted(self) -> None:
        """말해지지 않는 문자는 길이를 늘리지 않는다."""
        assert speech_units("가나다") == speech_units("가, 나. 다!")

    def test_latin_counts_less_than_hangul(self) -> None:
        """라틴 문자는 한 글자가 한 음절이 아니다(3자를 1로 친다)."""
        assert speech_units("abc") < speech_units("가나다")


class TestEstimate:
    def test_longer_text_takes_longer(self) -> None:
        """단조성. 추정기가 텍스트를 실제로 읽는다는 증거다(고정값이 아니다)."""
        short = estimate_speech_seconds("가루가 날려요")
        long = estimate_speech_seconds(
            "파우더를 바를 때마다 가루가 날리고, 피부에 고르게 밀착되지 않아 뭉치기도 합니다"
        )
        assert long > short

    def test_typical_line_is_not_the_old_flat_default(self) -> None:
        """기획 프롬프트가 요구하는 분량의 한 줄은 예전 고정값(4초)으로는 어림도 없다.

        이 테스트가 이 기능의 존재 이유다. 40자 안팎의 대사를 4초에 넣으라고 요청하면 벤더는
        문장이 끝나지 않는 클립을 만든다.
        """
        line = "이거 바르면 가루가 안 날리나요? 밀착력이 달라서 뭉치지 않아요"
        assert len(line) >= 30
        assert estimate_speech_seconds(line) > 4.0

    def test_sentence_breaks_add_pause(self) -> None:
        """문장이 나뉘면 사이에 숨이 들어간다(같은 음절 수라도 더 길다)."""
        one = estimate_speech_seconds("가나다라마바사아자차")
        two = estimate_speech_seconds("가나다라마. 바사아자차")
        assert two > one


class TestClampBoundary:
    def test_fits_the_compose_clamp_for_realistic_lines(self) -> None:
        """현실적인 대사 길이는 compose 의 상한(20초) 안에 든다.

        넘어도 잘리기만 하지만, 프롬프트가 요구하는 분량이 상한을 늘 넘는다면 그건 추정기가
        아니라 프롬프트 예산이 잘못됐다는 뜻이다.
        """
        line = "파우더를 바를 때마다 날리는 가루, 고르게 밀착되지 않고 뭉치기도 하죠"
        assert 2.0 <= estimate_speech_seconds(line) <= 20.0
