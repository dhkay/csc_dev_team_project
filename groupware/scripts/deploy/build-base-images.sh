#!/usr/bin/env bash
# 스택 공용 base 이미지(csc/node-base, csc/python-base) 빌드: 단일 진실원(SSOT).
#
# 모든 앱 Dockerfile 이 `FROM csc/node-base` / `FROM csc/python-base` 로 재사용하므로,
# compose 로 앱 이미지를 빌드하기 "전에" 이 두 base 를 로컬 이미지 캐시에 올려둬야 한다.
# (없으면 `docker compose up --build` 가 `pull access denied: csc/python-base` 로 실패한다.)
# 변경 없으면 레이어 캐시로 즉시 통과: 멱등, 저비용이라 매번 호출해도 안전하다.
#
# 사용처(여기 한 곳에서만 정의: CI/CD 와 dev 가 동일하게 재사용):
#   - CI/CD 배포: scripts/deploy/deploy.sh (staging/prod, self-hosted Ubuntu 러너)
#   - dev 스택 기동: infra/docker/dev/{web,ai} 의 `docker compose up --build` 직전
#
# 사용: bash scripts/deploy/build-base-images.sh
set -euo pipefail

# 이 스크립트 위치에서 모노레포 루트 해석(scripts/deploy → repo root). 어느 CWD 에서 호출해도 동작.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_DIR="$REPO_ROOT/infra/docker/base"

echo "base 이미지 빌드(csc/node-base, csc/python-base).."
docker build -t csc/node-base:latest -f "$BASE_DIR/node.Dockerfile" "$BASE_DIR"
docker build -t csc/python-base:latest -f "$BASE_DIR/python.Dockerfile" "$BASE_DIR"
echo "base 이미지 준비 완료"
