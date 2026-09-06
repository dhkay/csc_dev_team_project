# metrics-agent (FastAPI / uv): 호스트 시스템 지표(CPU/GPU/VRAM/RAM) 수집 에이전트. 호스트당 1개.
# uv 워크스페이스 멤버: 빌드 컨텍스트 = 워크스페이스 루트 apps/api/fastapi (공유 csc-net-utils 포함).
#   docker build -t csc/api-metrics-agent:staging -f metrics-agent/Dockerfile apps/api/fastapi
# GPU 호스트(video-ai-server)에서는 compose 의 runtime:nvidia 로 libnvidia-ml 이 주입된다(CUDA 베이스 불필요).

FROM csc/python-base:latest AS run

# RAM 모듈(SMBIOS) 상세용 dmidecode: /metrics/hardware 에서 호출(root + 호스트 DMI 접근 필요).
# 없으면 모듈 목록이 빈 채로 degrade(치명적 아님).
RUN (apt-get update && apt-get install -y --no-install-recommends dmidecode && rm -rf /var/lib/apt/lists/*) \
    || (apk add --no-cache dmidecode) || true

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
RUN uv sync --frozen --no-dev --package metrics-agent --no-install-workspace

# 2) 공유 패키지 + 앱 소스 → 워크스페이스 패키지(csc-net-utils) 설치.
COPY net-utils ./net-utils
COPY metrics-agent ./metrics-agent
RUN uv sync --frozen --no-dev --package metrics-agent

WORKDIR /app/metrics-agent
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
