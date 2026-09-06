"""도메인 타입: 소스 식별자, 언어, 보관 수, 입력 제약.

같은 소스지만 언어에 따라 부르는 API 가 다르다. 한국어는 action API(`api.php`), 영어는
REST(`page/summary`)다. 응답 구조도 달라 파서를 갈라 쓰고, 여기서는 그 선택의 이름만 정한다.
"""

from __future__ import annotations

from enum import Enum


# 제품 수준 소스 식별자. AI 도구의 소스 설정 key 와 카탈로그가 같은 문자열을 쓴다.
SOURCE_ID = "WIKIPEDIA_SUMMARY"


class Language(str, Enum):
    """조회할 위키백과 언어판."""

    KO = "ko"
    EN = "en"


LANGUAGE_LABELS: dict[Language, str] = {
    Language.KO: "한국어",
    Language.EN: "영어",
}

# 문서 하나를 조회하는 소스라 결과도 하나다. 진행률의 분모이기도 하다.
KEEP_COUNT = 1

# 문서 제목 최대 길이. 위키백과 제목 상한(255바이트)보다 넉넉하게 잡되, 무제한을 두지 않는다
#   (제목이 곧 타깃 키라 길이를 열어 두면 키가 무한정 길어진다).
TITLE_MAX_LENGTH = 200
