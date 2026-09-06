"""수집 전략: 직접 HTTP(브라우저 없음).

getKeywordRank 는 timeUnit+cid 만으로 날짜별 랭킹 배열을 주는 순수 XHR 엔드포인트라, 브라우저 없이
평범한 HTTP POST 로 그대로 받을 수 있다. 실측으로 확인: 컨테이너 egress 에서 직접 요청하면 date/week/month
세 기간 모두 12개씩 정상 반환된다.

브라우저 전략을 대체한 이유. Selenium 자연내비 전략은 세션 쿠키를 실은 in-page fetch 로 호출하는데,
그 세션 상태가 월간(timeUnit=month) 요청에만 빈 응답을 유발했다(date/week 는 정상). 브라우저를 안 거치면
그 함정 자체가 없고, 브라우저 기동/자연내비/사람 흉내 지연(수집당 ~17s)도 사라져 훨씬 빠르다.

그 브라우저 어댑터(selenium_chromium / naver_search / direct_warmup)는 배선된 적이 없어 삭제했다.
네이버가 나중에 직접 요청을 차단하면 "브라우저로 쿠키만 확보 후 그 쿠키로 직접 HTTP" 하이브리드가 복구
경로다. 삭제 이전 구현은 git 이력에 있고, 되살리더라도 이 포트만 교체하면 된다(서비스/파서 불변).
"""

from __future__ import annotations

import urllib.request
from urllib.parse import urljoin

# getKeywordRank 는 파라미터를 쿼리스트링으로 받고 본문은 비운다(데이터랩 UI XHR 과 동일).
#   Referer/X-Requested-With 가 있어야 정상 JSON 을 준다(없으면 차단/리다이렉트).
_ACCEPT = "application/json, text/javascript, */*; q=0.01"
_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8"


class DirectHttpNavigation:
    """getKeywordRank 를 브라우저 없이 직접 HTTP POST 로 호출."""

    def __init__(
        self,
        *,
        datalab_url: str,
        user_agent: str,
        timeout: float,
    ) -> None:
        # datalab_url = sCategory 페이지. getKeywordRank 는 같은 디렉터리의 sibling 이라 urljoin 으로 도출.
        #   Referer 로도 이 페이지를 쓴다(같은 오리진 XHR 로 보이게).
        self._referer = datalab_url
        self._endpoint = urljoin(datalab_url, "getKeywordRank.naver")
        self._user_agent = user_agent
        self._timeout = timeout

    def acquire_html(self, cid: str, time_unit: str) -> str:
        url = f"{self._endpoint}?timeUnit={time_unit}&cid={cid}"
        req = urllib.request.Request(
            url,
            data=b"",  # UI 와 동일하게 본문은 빈다.
            method="POST",
            headers={
                "Referer": self._referer,
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": _CONTENT_TYPE,
                "Accept": _ACCEPT,
                "User-Agent": self._user_agent,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as exc:  # noqa: BLE001
            # 네트워크/HTTP 실패는 빈 응답으로 degrade 한다(파서가 [] 반환).
            # 파서는 "ERROR:" prefix 를 빈 결과로 처리하고, 서비스는 빈 결과면 upsert 를 건너뛴다
            #   → 예외로 워커를 죽이지 않고 이전 수집분을 보존한다.
            return f"ERROR:{type(exc).__name__}: {exc}"
