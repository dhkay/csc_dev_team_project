# video-model (FastAPI / uv): 마케팅 영상 제작 자동화. FFmpeg 영상 처리 포함.
# uv 워크스페이스 멤버: 빌드 컨텍스트 = 워크스페이스 루트 apps/api/fastapi (공유 csc-net-utils 포함).
#   docker build -t csc/video-model:staging -f video-model/Dockerfile apps/api/fastapi

FROM csc/python-base:latest AS run

# 이 앱 전용 의존성: ffmpeg(트랜스코딩) + 한국어 폰트(NanumGothic)/fontconfig. 최종 영상 자막/제목 번인(libass)에 필요.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-nanum fontconfig \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

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
RUN uv sync --frozen --no-dev --package video-model --no-install-workspace

# 2) 공유 패키지 + 앱 소스 → 워크스페이스 패키지(csc-net-utils) 설치.
COPY net-utils ./net-utils
COPY video-model ./video-model
RUN uv sync --frozen --no-dev --package video-model

WORKDIR /app/video-model
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
