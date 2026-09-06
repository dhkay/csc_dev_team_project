# log-server (FastAPI / uv): 통합 로그 수집/조회. Kafka 버퍼 + ClickHouse 저장.
# uv 워크스페이스 멤버: 빌드 컨텍스트 = 워크스페이스 루트 apps/api/fastapi (공유 패키지 포함).
#   docker build -t csc/api-log-server:staging -f log-server/Dockerfile apps/api/fastapi
#
# 한 이미지로 두 프로세스를 띄운다:
#   API    : python clickhouse/migrate.py && uvicorn app.main:app
#   컨슈머 : python -m app.worker
# 마이그레이션은 API 컨테이너 command 에서만 돌린다(둘 다 돌리면 경합).

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
RUN uv sync --frozen --no-dev --package log-server --no-install-workspace

# 2) 공유 패키지 + 앱 소스 → 워크스페이스 패키지(csc-net-utils, csc-log-contracts) 설치.
COPY net-utils ./net-utils
COPY log-contracts ./log-contracts
COPY log-server ./log-server
RUN uv sync --frozen --no-dev --package log-server

WORKDIR /app/log-server
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["sh", "-c", "python clickhouse/migrate.py && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
