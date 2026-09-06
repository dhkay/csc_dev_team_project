"""환경변수 (pydantic-settings)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "file-upload"
    # 배포 환경(dev/staging/prod). dev 외에서는 dev 기본 시크릿 사용 시 기동 거부(fail-closed).
    app_env: str = "dev"
    database_url: str = "postgresql+asyncpg://localhost:5432/file_upload"

    # OpenAPI 스펙(/openapi.json) 노출 여부: 전 환경 기본 노출(통합 문서 포털 scalar-gateway 가 수집).
    # 스펙 경로는 ServiceTokenMiddleware 면제 + 내부망(LAN/nginx allowlist) 한정이라 외부 노출되지 않는다.
    # Swagger UI(/docs), ReDoc(/redoc) 은 개별 UI 라 dev 에서만 노출하고, 통합 UI 는 포털이 담당한다.
    expose_openapi: bool = True

    # 스토리지 백엔드: 환경마다 인프라가 달라질 수 있어 config 로 선택(StoragePort 가 교체 지점).
    #   local : 로컬/마운트 파일시스템(현재 유일 구현). NAS 도 마운트면 local + storage_root 만 바꾸면 됨.
    #   s3/r2 : 오브젝트 스토리지(추후 어댑터 추가 → container._build_storage 에 분기).
    storage_backend: str = "local"

    # 1차 스토리지 = 서버 로컬 파일시스템 폴더. 배포는 호스트 storage/ 를 컨테이너에 마운트.
    # (NAS 이전 시에도 마운트면 backend=local 유지 + storage_root 만 NAS 경로로.)
    storage_root: str = "./storage"

    # 2차 아카이브: 조직 하드 삭제 시 1차에서 옮겨 보관(1차와 직교, ArchivePort 교체 지점).
    #   local : 로컬/마운트 파일시스템(현재 유일 구현). NAS 는 마운트면 local + archive_root 만 바꾸면 됨.
    archive_backend: str = "local"
    archive_root: str = "./archive"
    # 브라우저가 PUT(업로드), GET(다운로드)하는 공개 베이스 URL. nginx 가 공인 IP 제한으로 노출.
    # dev 기본값은 file-upload dev 포트(8001): 브라우저가 같은 서버로 직접 PUT/GET. prod 는 compose 주입.
    public_upload_base_url: str = "http://localhost:8001"
    # presigned PUT URL 서명/검증 시크릿(HS256). prod 는 compose 에서 주입.
    upload_url_secret: str = "dev-only-upload-secret"
    upload_url_ttl_seconds: int = 600
    # 서명 다운로드(GET) 토큰 TTL: 렌더 시 BFF 가 /uploads/access-urls 로 발급받아 임베드.
    download_url_ttl_seconds: int = 3600
    # 조직 스코프 접근통제: True 면 GET /files/{id} 가 서명 토큰(?token=)을 필수로 요구한다.
    #   기본 True(조직 격리 강제). 모든 서버 렌더 경로가 서명 URL 로 전환됐다(로고/아바타/마케팅 에셋/영상).
    #   내부 서비스(worker)는 서비스토큰으로 우회. env REQUIRE_SIGNED_DOWNLOAD=false 로 긴급 비활성 가능.
    #   알려진 미전환(그때 해결): marketing-video 플랜카드 오디오 미리보기는 클라이언트가 URL 을 만들어(서명 불가)
    #   재생 시 403 → 필요 시 access-urls BFF 라우트 + 클라 발급으로 전환.
    require_signed_download: bool = True
    # 업로드 최대 크기(바이트): 영상 50MB 기준 여유.
    max_upload_size: int = 50 * 1024 * 1024
    # 스토리지 화면(공통/조직/개인 파일 브라우저) 전용 상한. 일반 파일 저장소라 다른 경로보다 크다.
    #   상한을 따로 두는 이유: 이 값을 올리려고 max_upload_size 를 올리면 아바타와 마케팅 에셋
    #   경로까지 함께 넓어진다. 브라우저 PUT 은 스트리밍으로 저장하므로 메모리에 통째로 올라가지 않는다.
    #   nginx 도 /blob 위치의 client_max_body_size 를 이 값보다 크게 잡아야 한다.
    storage_max_upload_size: int = 200 * 1024 * 1024

    # PENDING 자산 수거자
    # 확정되지 않은 자산을 거두는 주기 잡. PENDING 은 presign 만 받고 끝난 업로드이거나, 그 자산을
    #   참조할 쓰기가 실패해 확정되지 않은 것이다(소비 서비스가 참조 행을 만들 때 확정한다).
    #   UPLOADED 는 거두지 않는다: 참조 여부를 아는 것은 소비 서비스이고 이 서버가 아니다.
    #   계약: docs/specs/marketing-write-consistency.md
    # TTL 을 넉넉히 두는 이유: 업로드 중(브라우저가 PUT 하는 동안)인 자산을 거두면 그 업로드가 깨진다.
    pending_reap_after_hours: int = 24
    # 한 번에 거두는 최대 건수: 큰 백로그가 한 트랜잭션을 길게 잡지 않게 나눠 거둔다.
    pending_reap_batch_limit: int = 500
    # 수거 주기 잡을 돌리는 redis 논리 DB. 서비스별 전용(잡 도난 방지, db 0 은 예약).
    #   1=data-collector, 2=video-model, 3=language-model, 4=file-upload.
    redis_url: str = "redis://localhost:6379/4"
    worker_max_jobs: int = 2

    # CORS: 브라우저 직접 PUT(/blob), GET(/files) 가 web 앱과 다른 origin 이라 허용 목록 필요.
    # dev 기본값은 두 web 앱 dev 호스트. prod 는 compose 에서 ALLOWED_ORIGINS 주입.
    allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://admin.localhost:5174"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    # 보안 Layer 3: 서버 간 인증(Service Token). dev 기본값은 BFF 폴백과 동일.
    # prod 는 compose 에서 SERVICE_TOKEN_SECRET 을 필수(:?)로 주입한다.
    service_token_secret: str = "dev-only-service-secret"
    # video-model(worker 신원)도 file-service 호출자다. 결과 저장(POST /uploads/store)/원본 조회.
    # scalar-gateway = 통합 문서 포털(서비스토큰으로 /openapi.json, Try-it-out 호출).
    allowed_services: str = (
        "web-groupware,web-control-tower,csc-groupware,csc-control-tower,csc-marketing,video-model,scalar-gateway"
    )

    @property
    def allowed_services_set(self) -> set[str]:
        return {s.strip() for s in self.allowed_services.split(",") if s.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
