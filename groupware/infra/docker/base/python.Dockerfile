# csc/python-base: Python + uv 공통 툴체인.
# 모든 FastAPI 앱 Dockerfile 이 `FROM csc/python-base` 로 재사용한다.
# 앱별 특이 의존성(예: video-model 의 ffmpeg)은 각 앱 Dockerfile 에서 추가한다.
#
# 빌드: docker build -t csc/python-base:latest -f infra/docker/base/python.Dockerfile infra/docker/base
FROM python:3.12-slim

# uv 바이너리 (공식 이미지에서 복사)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
