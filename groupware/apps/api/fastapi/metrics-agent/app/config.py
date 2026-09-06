"""환경변수 (pydantic-settings): metrics-agent.

호스트당 1개로 떠서 그 호스트의 CPU/GPU/VRAM/RAM 을 읽어 스냅샷을 제공한다.
DB 없음. 컨테이너에서 호스트 지표를 읽으려면 HOST_PROC 로 마운트된 호스트 /proc 을 가리킨다.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "metrics-agent"
    # 배포 환경(dev/staging/prod). dev 외에서는 dev 기본 시크릿 사용 시 기동 거부(fail-closed).
    app_env: str = "dev"

    # OpenAPI 스펙 노출(통합 문서 포털 수집): 토큰 면제 + 내부망 한정.
    expose_openapi: bool = True

    # 보안 Layer 3: 서버 간 인증(Service Token).
    # 애그리게이터(csc-control-tower) + 통합 문서 포털(scalar-gateway, 스펙 수집/Try-it-out)만 허용.
    # ai 호스트 인스턴스는 compose 에서 csc-control-tower 로 다시 좁힌다. 포털이 LAN 너머로
    # 도달하지 못하므로 굳이 허용 폭을 넓히지 않는다.
    service_token_secret: str = "dev-only-service-secret"
    allowed_services: str = "csc-control-tower,scalar-gateway"

    # 이 에이전트가 대표하는 호스트 정체성(레지스트리/대시보드 표시에 사용).
    host_id: str = "dev-local"
    host_label: str = "Local PC"
    host_role: str = "all"  # web | ai | all

    # 컨테이너에서 호스트 /proc 을 마운트한 경로(psutil 보정). 비컨테이너 실행 시 기본 /proc.
    host_proc: str = "/proc"

    # 디스크(스토리지) 사용량을 읽을 경로. 컨테이너는 호스트 루트를 /host/root 로 ro 마운트하고
    # DISK_PATH=/host/root 로 지정한다(호스트 실측). 비컨테이너/Windows 는 기본값에서 자동 폴백.
    disk_path: str = "/"

    # 물리 디스크(SSD/HDD) 식별용 sysfs 경로. 컨테이너는 호스트 /sys 를 마운트(HOST_SYS=/host/sys).
    host_sys: str = "/sys"

    @property
    def allowed_services_set(self) -> set[str]:
        return {s.strip() for s in self.allowed_services.split(",") if s.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
