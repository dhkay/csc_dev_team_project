"""CredentialProviderPort 구현: 플랫폼 env 자격증명.

조직별 자격증명이 아니다. /lab 은 플랫폼 팀 실험 표면이고, 조직 자격증명은 marketingdb
(csc-marketing 소유)에 있어 이 서버가 읽을 수 없다(DB 소유권 규칙). 실사용으로 승격할 때는
이 어댑터를 csc-marketing `/internal/...resolve` 호출 구현으로 교체하면 된다. 포트가 이미
async 라 서비스/스키마/라우터는 그대로다.

미설정 키는 빈 문자열로 돌려준다. 여기서 예외를 던지지 않는 이유: 무엇이 비었는지는
어댑터가 자기 필수 목록과 대조해 판단해야 하고, 그래야 응답에 missingEnv 를 정확히 실을 수 있다.
"""

from __future__ import annotations

from collections.abc import Mapping

from ....core.domain.types import LabSource


class EnvCredentialProvider:
    """config(pydantic-settings) 값을 소스별 키 맵으로 노출한다.

    설정값은 직접 속성 접근으로 읽는다. getattr 기본값 폴백을 쓰면 필드명을 오타냈을 때
    빈 문자열이 나와 영원히 credentials_missing 으로 보이고, 그건 이 표면이 없애려는 바로 그
    조용한 실패다. 지금은 오타가 기동/호출 즉시 AttributeError 로 드러난다.
    """

    def __init__(self, settings) -> None:  # noqa: ANN001
        self._settings = settings

    async def for_source(self, source: LabSource) -> Mapping[str, str]:
        s = self._settings
        if source is LabSource.NAVER_DATALAB_SEARCH:
            return {
                "NAVER_TREND_CLIENT_ID": s.naver_trend_client_id,
                "NAVER_TREND_CLIENT_SECRET": s.naver_trend_client_secret,
            }
        if source in (
            LabSource.NAVER_SHOPPING_CATEGORIES,
            LabSource.NAVER_SHOPPING_KEYWORD_AGE,
        ):
            return {
                "NAVER_SHOPPING_CLIENT_ID": s.naver_shopping_client_id,
                "NAVER_SHOPPING_CLIENT_SECRET": s.naver_shopping_client_secret,
            }
        if source is LabSource.NAVER_SEARCHAD_KEYWORDSTOOL:
            return {
                "NAVER_SEARCHAD_ACCESS_LICENSE": s.naver_searchad_access_license,
                "NAVER_SEARCHAD_SECRET_KEY": s.naver_searchad_secret_key,
                "NAVER_SEARCHAD_CUSTOMER_ID": s.naver_searchad_customer_id,
            }
        return {}
