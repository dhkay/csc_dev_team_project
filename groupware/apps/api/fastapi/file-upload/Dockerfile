# file-upload (FastAPI / uv): 파일 업로드 / 오브젝트 스토리지. FFmpeg 없음.
# uv 워크스페이스 멤버: 빌드 컨텍스트 = 워크스페이스 루트 apps/api/fastapi (공유 csc-net-utils 포함).
#   docker build -t csc/file-upload:staging -f file-upload/Dockerfile apps/api/fastapi

FROM csc/python-base:latest AS run

WORKDIR /app

# 1) 의존성 레이어 캐싱: 워크스페이스 매니페스트 + 락만 먼저(3rd-party deps만, 워크스페이스 패키지 제외).
COPY pyproject.toml uv.lock ./
# uv.lock 이 전 워크스페이스 멤버를 참조하므로 --frozen sync 에는 모든 멤버의 매니페스트가 필요하다.
# 멤버 추가 시 이 목록도 함께 갱신할 것(누락하면 이 이미지 빌드가 깨진다).
COPY net-utils/pyproject.toml ./net-utils/pyproject.toml
COPY log-contracts/pyproject.toml ./log-contracts/pyproject.toml
COPY video-model/pyproject.toml ./video-model/pyproject.toml
COPY file-upload/pyproject.toml ./file-upload/pyproject.toml
COPY language-model/pyproject.toml ./language-model/pyproject.toml
COPY metrics-agent/pyproject.toml ./metrics-agent/pyproject.toml
COPY data-collector/pyproject.toml ./data-collector/pyproject.toml
COPY log-server/pyproject.toml ./log-server/pyproject.toml
RUN uv sync --frozen --no-dev --package file-upload --no-install-workspace

# 2) 공유 패키지 + 앱 소스 → 워크스페이스 패키지(csc-net-utils) 설치.
COPY net-utils ./net-utils
COPY file-upload ./file-upload
RUN uv sync --frozen --no-dev --package file-upload

WORKDIR /app/file-upload
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
# 기동 시 alembic 으로 스키마를 최신화(멱등) 후 서버 실행. db-migrate 서비스(drizzle)는
# file-upload 의 alembic 을 적용하지 않으므로 컨테이너가 직접 적용한다. depends_on(db healthy) 보장.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
