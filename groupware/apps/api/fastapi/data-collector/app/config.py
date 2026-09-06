"""환경변수 (pydantic-settings)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "data-collector"
    # 배포 환경(dev/staging/prod). dev 외에서는 dev 기본 시크릿 사용 시 기동 거부(fail-closed).
    app_env: str = "dev"
    # 논리 DB 이름은 crawler 로 유지한다(서버 리네임과 무관). 바꾸면 initdb 가 빈 DB 를 새로
    #   만들고 그동안 수집한 캐시가 고아가 된다. 이름과 내용이 어긋나 보여도 여기는 손대지 않는다.
    database_url: str = "postgresql+asyncpg://localhost:5432/crawler"

    # OpenAPI 스펙(/openapi.json): 통합 문서 포털(scalar-gateway) 수집. 내부망 한정.
    #   /lab 서브앱도 자기 /lab/openapi.json 을 이 플래그로 함께 켜고 끈다(문서 정책 일치).
    expose_openapi: bool = True

    # 보안 Layer 3: 서버 간 인증(Service Token). dev 기본값은 BFF 폴백과 동일.
    # prod 는 compose 에서 SERVICE_TOKEN_SECRET 을 필수(:?)로 주입한다.
    service_token_secret: str = "dev-only-service-secret"
    # 호출자 화이트리스트: datalab-home 은 csc-marketing 이 호출. scalar-gateway = 문서 포털.
    allowed_services: str = "csc-marketing,scalar-gateway"

    # ---- 큐/워커/스케줄 ----
    # 전용 redis 논리 DB: 서비스별 격리(arq 잡 도난 방지, db 0 은 예약). data-collector=db 1.
    #   상세 컨벤션: .claude/rules/system-architecture.md (redis 소유권).
    redis_url: str = "redis://localhost:6379/1"
    # 동시 수집 잡 수(arq max_jobs). 대상 사이트 부하를 낮게 유지한다. compose 가 env 로 주입.
    worker_max_jobs: int = 2
    # 캐시 신선도 TTL 은 여기 없다. 소스마다 쿼터가 달라 전역 상수 하나로 정할 수 없으므로
    #   각 소스 서술자의 RefreshPolicy 가 정한다(app/domains/catalog/core/domain/entities.py).
    # cron 재수집 대상에서 제외할 유휴 기간(일). 컷오프가 없으면 한 번이라도 조회된 타깃이
    #   영원히 매시간 재수집되어, 대상 사이트에도 우리 큐에도 계속 쌓인다.
    active_target_max_idle_days: int = 30

    # ---- 실사용 수집 대상(네이버 데이터랩 쇼핑인사이트) ----
    datalab_shopping_url: str = "https://datalab.naver.com/shoppingInsight/sCategory.naver"
    # 아래 둘은 살아 있는 설정이다. DirectHttpNavigation 이 매 요청에 그대로 쓴다(worker.py 조립).
    #   지우면 예외 없이 수집만 조용히 멈춘다: 내비가 "ERROR:" 를 반환 → 파서가 빈 배열 →
    #   서비스가 "빈 결과는 덮어쓰지 않음" 으로 skip. 로그도 알림도 없이 데이터만 낡는다.
    #   (구 이름 browser_user_agent / browser_page_timeout. 브라우저를 안 쓰므로 crawl_* 로 정정했다.)
    crawl_user_agent: str = (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/108.0.0.0 Safari/537.36"
    )
    crawl_timeout_seconds: float = 30.0

    # ---- 실사용 수집 대상(자격증명이 필요 없는 공개 소스) ----
    # 아래 셋은 키가 없다. 주소만 설정으로 두는 이유는 벤더가 경로를 바꿀 때 재배포 없이 돌리기
    #   위해서다(구글 트렌드는 실제로 경로가 한 번 바뀌었고, 옛 경로는 404 와 함께 HTML 을 준다).
    google_trends_base_url: str = "https://trends.google.com"
    nate_base_url: str = "https://www.nate.com"
    nate_realtime_path: str = "/js/data/jsonLiveKeywordDataV1.js"
    # {lang} 은 언어판(ko/en)으로 치환된다.
    wikipedia_base_url_template: str = "https://{lang}.wikipedia.org"
    # 위키미디어는 브라우저를 흉내 낸 UA 를 403 으로 막는다. 도구 이름과 연락처를 밝히는 서술형
    #   UA 여야 200 이 온다(실측). 연락처가 바뀌면 재배포 없이 고칠 수 있도록 설정값으로 둔다.
    wikipedia_user_agent: str = (
        "csc-data-collector/1.0 (https://cscuniverse.com; ops@cscuniverse.com)"
    )
    # ---- 실사용 수집 대상(쿼터가 좁아 자동 재수집을 끈 소스) ----
    # 값은 sandbox/api-test/keys.env 에 있다. 워커 컨테이너에 넣어야 한다: 실제 수집은 워커가
    #   하므로 API 쪽에만 넣으면 수집이 조용히 빈 결과가 된다(예외도 없이 데이터만 낡는다).
    youtube_base_url: str = "https://www.googleapis.com"
    # YouTube Data API v3 키. search.list 가 호출당 100 유닛이라 하루 100회 남짓이 한도다.
    #   sandbox/api-test/keys.env 에서는 같은 값이 GOOGLE_API_KEY 라는 이름으로 있다(그 키는
    #   구글 API 공용이라 그렇게 불렀다). 여기서는 어느 API 의 자격인지 드러나는 이름을 쓴다.
    youtube_api_key: str = ""
    serpapi_base_url: str = "https://serpapi.com"
    # SerpApi 키. 요금제가 월 검색 횟수를 정한다(무료 100회).
    serpapi_api_key: str = ""

    # 외부 벤더 호출 타임아웃(초). 수집은 워커에서 돌아 사용자 요청을 막지 않으므로 넉넉하게 잡되,
    #   무한정 매달려 워커 슬롯을 점유하지는 않게 한다.
    vendor_http_timeout: float = 15.0

    # ---- 네이버 자격증명 (실사용 수집과 /lab 프로브가 함께 쓴다) ----
    # 같은 API 를 두 표면이 다른 목적으로 부르므로(수집 대 진단) 자격을 하나로 둔다. 갈라 두면
    #   한쪽만 설정된 채 다른 쪽이 401 로 죽고, 그 401 은 키가 틀린 것처럼 보여 원인을 찾기 어렵다.
    # 조직 스코프가 아니다: 전부 플랫폼 키다(조직 자격증명은 우리가 소유하지 않는다).
    #   따라서 /lab 결과는 특정 조직의 자격 상태에 대한 근거가 아니다.
    # 변수명은 sandbox/api-test/keys.env 와 맞춘다(그 실측이 기대값이라 이름이 갈리면 대조가 불가능하다).
    # 기본값을 빈 문자열로 두는 이유: 미설정이 기동을 막으면 안 되고(서비스토큰과 다르다),
    #   호출 전에 건너뛰어야 하기 때문이다(수집은 빈 결과, /lab 은 credentials_missing).
    naver_openapi_base_url: str = "https://openapi.naver.com"
    naver_searchad_base_url: str = "https://api.searchad.naver.com"
    # 데이터랩 검색어 트렌드: 실사용 수집(NAVER_SEARCH_TREND) + LAB-001. 실측 200. 일 1,000회.
    naver_trend_client_id: str = ""
    naver_trend_client_secret: str = ""
    # 쇼핑인사이트 오픈API: /lab 전용(LAB-002, LAB-003). 실측 401(errorCode 024)이라 실사용
    #   수집이 없다. 키 문제가 아니라 개발자센터 앱에 '데이터랩(쇼핑인사이트)' 항목이 미등록이다.
    #   (실사용 쇼핑인사이트 수집은 오픈API 가 아니라 datalab_shopping_url 직접 수집으로 한다.)
    naver_shopping_client_id: str = ""
    naver_shopping_client_secret: str = ""
    # 검색광고 키워드도구: 실사용 수집(NAVER_AD_KEYWORD) + LAB-004. HMAC-SHA256 서명. 실측 200.
    naver_searchad_access_license: str = ""
    naver_searchad_secret_key: str = ""
    naver_searchad_customer_id: str = ""

    # ---- /lab 검증 표면 ----
    # 아직 실사용하지 않는 외부 API 를 Scalar 에서 눌러 보는 표면. 끄면 라우트 자체가 사라져
    #   401 이 아니라 404 가 난다(표면 미존재가 응답으로 분명해진다).
    lab_enabled: bool = True
    lab_http_timeout: float = 10.0

    @property
    def allowed_services_set(self) -> set[str]:
        return {s.strip() for s in self.allowed_services.split(",") if s.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
