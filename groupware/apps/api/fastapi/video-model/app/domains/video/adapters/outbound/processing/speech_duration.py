"""대화내용 → 그것을 말하는 데 걸리는 시간(초).

씬 길이의 규칙은 하나다: 그 씬의 대화내용을 말하는 시간이다. 재는 방법만 둘로 갈린다.

    나레이션 켬  TTS 를 만들어 그 mp3 길이를 잰다 (정확).  compose._build_audio
    나레이션 끔  이 모듈이 텍스트에서 추정한다 (근사).

끈 경로에 추정이 필요한 이유: 그때는 화면 속 인물이 직접 말하고, 그 발화는 벤더가 만든 클립 안에
이미 끝나 있다. 그래서 받아온 클립을 자르지도 늘리지도 않는다(compose 가 `fit_to_duration` 을 쓰지
않는 분기다. 자르면 문장이 잘린다). 즉 요청 길이가 결과에 닿는 유일한 손잡이이고, 그 값이
대화내용과 무관하면 벤더는 말이 끝나지 않는 클립을 만든다.

정확할 필요는 없고 모자라지 않으면 된다. 모자라면 문장이 끊기고, 넘치면 벤더 열거값이 올림해 준
여유만큼 끝에 정적이 남을 뿐이다. 그래서 속도를 보수적으로 잡고 앞뒤 여백을 더한다.
"""

from __future__ import annotations

import re

# 한국어 자연 발화 속도(음절/초). 뉴스 낭독은 5.5 이상까지 가지만 인물이 말하는 장면은 그보다 느리다.
#   낮게 잡는 쪽이 안전하다: 이 값이 낮으면 길이를 넉넉히 요청하게 된다(위 머리주석 참고).
_SYLLABLES_PER_SEC = 4.5

# 문장 사이의 숨. 마침표/물음표/느낌표마다 한 번.
_SENTENCE_PAUSE_SEC = 0.35

# 말이 시작되기 전과 끝난 뒤의 여백. 클립이 발화로 시작해 발화로 끝나면 잘린 것처럼 보인다.
_LEAD_SEC = 1.0

# 발화 단위 세기: 한글 음절은 1, 숫자도 1(읽으면 한 음절 이상이다), 라틴 문자는 3자를 1로 친다.
#   공백과 문장부호는 세지 않는다(말해지지 않는다). 문장부호는 아래 쉼으로만 반영한다.
_HANGUL = re.compile(r"[가-힣]")
_DIGIT = re.compile(r"[0-9]")
_LATIN = re.compile(r"[A-Za-z]")
_SENTENCE_END = re.compile(r"[.!?。！？]")

_LATIN_PER_SYLLABLE = 3


def speech_units(text: str) -> float:
    """말해지는 단위 수. 문장부호와 공백은 세지 않는다."""
    hangul = len(_HANGUL.findall(text))
    digits = len(_DIGIT.findall(text))
    latin = len(_LATIN.findall(text)) / _LATIN_PER_SYLLABLE
    return hangul + digits + latin


def estimate_speech_seconds(text: str) -> float:
    """이 문장을 말하는 데 걸리는 시간(초). 말이 없으면 0.0.

    호출부(compose)가 0.0 을 "말이 없는 씬" 으로 읽어 기본 길이를 쓴다. 여기서 기본값을 돌려주면
    "말이 없다" 와 "아주 짧게 말한다" 가 같은 값이 되어 호출부가 둘을 구분하지 못한다.
    """
    units = speech_units(text)
    if units <= 0:
        return 0.0

    sentences = len(_SENTENCE_END.findall(text))
    return units / _SYLLABLES_PER_SEC + sentences * _SENTENCE_PAUSE_SEC + _LEAD_SEC
