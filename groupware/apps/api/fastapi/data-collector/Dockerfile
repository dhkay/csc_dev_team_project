# data-collector (FastAPI / uv): 외부 데이터 수집 서버(실사용 표면 + /lab 검증 표면).
# uv 워크스페이스 멤버: 빌드 컨텍스트 = 워크스페이스 루트 apps/api/fastapi (공유 csc-net-utils 포함).
#   docker build -t csc/api-data-collector:staging -f data-collector/Dockerfile apps/api/fastapi

FROM csc/python-base:latest AS run

# 시스템 패키지 없음. 수집은 urllib/httpx 직접 HTTP 이고 lab 도 마찬가지라 브라우저가 필요 없다.
#   (구 버전은 Chromium 108 + chromedriver + Xvfb 를 설치했다. 그 Selenium 전략은 월간 요청에서
#    빈 응답을 받아 폐기됐고 어댑터도 배선된 적이 없어 삭제했다. 덕분에 이미지가 수백 MB 줄고,
#    빌드가 외부 스냅샷 아카이브(storage.googleapis.com)에 의존하지 않는다.)

WORKDIR /app

# 1) 의존성 레이어 캐싱: 워크스페이스 매니페스트 + 락만 먼저(3rd-party deps만).
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
RUN uv sync --frozen --no-dev --package data-collector --no-install-workspace

# 2) 공유 패키지 + 앱 소스 → 워크스페이스 패키지(csc-net-utils) 설치.
COPY net-utils ./net-utils
COPY data-collector ./data-collector
RUN uv sync --frozen --no-dev --package data-collector

WORKDIR /app/data-collector
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
# API 기본(기동 시 스키마 최신화). 워커는 compose 가 command 로 오버라이드:
#   arq app.worker.WorkerSettings
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
