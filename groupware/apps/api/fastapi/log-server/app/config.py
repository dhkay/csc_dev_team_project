"""환경변수 (pydantic-settings)."""

from __future__ import annotations

from functools import lru_cache

from csc_log_contracts import PLATFORM_SCOPE
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "log-server"
    # 배포 환경(dev/staging/prod). dev 외에서는 dev 기본 시크릿 사용 시 기동 거부(fail-closed).
    # 수집된 로그의 environment 필드 기본값으로도 쓰인다(프로듀서가 안 실어 보낸 경우).
    app_env: str = "dev"

    # OpenAPI 스펙(/openapi.json) 노출: 전 환경 기본 노출(통합 문서 포털 scalar-gateway 가 수집).
    # 스펙 경로는 ServiceTokenMiddleware 면제 + 내부망 한정이라 외부 노출되지 않는다.
    expose_openapi: bool = True

    # 보안 Layer 3: 서버 간 인증(Service Token). dev 기본값은 BFF 폴백과 동일.
    # prod 는 compose 에서 SERVICE_TOKEN_SECRET 을 필수(:?)로 주입한다.
    service_token_secret: str = "dev-only-service-secret"
    # 전 백엔드가 로그를 생산하므로 수집 허용 목록이 사실상 전체 서비스 목록이다.
    # 조회(/logs/search, /logs/usage)는 라우트별 require_services 로 BFF 만 남긴다.
    allowed_services: str = (
        "web-groupware,web-control-tower,csc-groupware,csc-control-tower,"
        "csc-marketing,user,video-model,language-model,file-upload,data-collector,"
        "scalar-gateway"
    )

    # ---- Kafka (버퍼) ----
    # 로그는 태스크가 아니라 스트림이라 arq/Redis 가 아니라 Kafka 를 쓴다. fan-out, 재생,
    # kind 별 보존기간이 필요하다. 따라서 redis 논리 DB 할당표(system-architecture.md)와 무관하다.
    kafka_bootstrap_servers: str = "localhost:9092"
    # 이 인스턴스가 담당하는 scope. 기본(platform)은 승격되지 않은 전부를 맡는다.
    # 특정 AI 도구를 승격하면 같은 이미지를 LOG_SCOPE=<tool> 로 한 벌 더 띄워 전용 파이프라인이 된다.
    log_scope: str = PLATFORM_SCOPE
    # 전용 토픽 네임스페이스로 승격할 AI 도구 key(CSV). 비면 전부 기본 토픽으로 간다.
    #   예: "marketing-video" → csc.marketing-video.logs.* 로 분리
    promoted_ai_tools: str = ""

    # ---- 컨슈머 배치 ----
    # ClickHouse 는 작은 insert 를 파트 폭발로 갚으므로 반드시 모아서 넣는다.
    # 최대 대기(ms)를 두어 트래픽이 적을 때도 로그가 버퍼에 오래 머무르지 않게 한다.
    consumer_batch_max_records: int = 500
    consumer_batch_max_wait_ms: int = 1000

    # ---- ClickHouse (저장소) ----
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_database: str = "logs"
    clickhouse_user: str = "default"
    clickhouse_password: str = ""

    @property
    def allowed_services_set(self) -> set[str]:
        return {s.strip() for s in self.allowed_services.split(",") if s.strip()}

    @property
    def promoted_ai_tools_set(self) -> set[str]:
        return {s.strip() for s in self.promoted_ai_tools.split(",") if s.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
