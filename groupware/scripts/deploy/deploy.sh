#!/usr/bin/env bash
# 공용 배포 스크립트 (staging / prod): base 이미지 빌드 → 지정 compose 빌드/기동 → 준비 확인.
# self-hosted 러너 잡(deploy-staging.yml / deploy-prod.yml)이 git 동기화 후 이 스크립트를 호출한다.
#
# 사용: scripts/deploy/deploy.sh <compose-file> [service ...]
#   <compose-file> : 예) infra/docker/staging/web/docker-compose.yml
#                        infra/docker/prod/ai/docker-compose.yml
#   [service ...]  : 비우면 전체, 지정 시 해당 서비스만 빌드/기동(부분 배포)
#
# 환경(staging/prod)은 compose 경로에서 자동 판별한다 (infra/docker/<env>/<stack>).
set -euo pipefail

COMPOSE_PATH="${1:?compose 파일 경로 필요}"
shift || true
SERVICES=("$@")

# compose 파일이 있는 디렉터리 / 모노레포 루트 해석.
COMPOSE_DIR="$(cd "$(dirname "$COMPOSE_PATH")" && pwd)"
COMPOSE_FILE="$(basename "$COMPOSE_PATH")"
REPO_ROOT="$(cd "$COMPOSE_DIR/../../../.." && pwd)"   # infra/docker/<env>/<stack> → repo root
ENV_NAME="$(basename "$(dirname "$COMPOSE_DIR")")"    # infra/docker/<env>/<stack> → <env>

echo "[$ENV_NAME] 배포: $COMPOSE_DIR/$COMPOSE_FILE"
[ "${#SERVICES[@]}" -gt 0 ] && echo "  대상 서비스: ${SERVICES[*]}"

# 1) 스택별 base 이미지(csc/node-base, csc/python-base) 빌드.
#    앱 Dockerfile 이 FROM 으로 사용하므로 compose 빌드보다 먼저 로컬 캐시에 올려둔다.
#    (변경 없으면 레이어 캐시로 즉시 통과. 두 base 모두 빌드: 멱등/저비용)
#    dev 스택 기동도 같은 스크립트를 재사용한다(SSOT: infra/docker/dev/README.md 참고).
bash "$REPO_ROOT/scripts/deploy/build-base-images.sh"

# 2) 앱 이미지 빌드 + 기동.
#    --no-cache 로 매 배포마다 "현재 소스"로 새로 빌드한다.
#    배경: `up --build` 는 BuildKit 레이어 캐시에 의존하는데, 모노레포 `COPY . .`
#    레이어가 소스 변경에도 stale 캐시 히트하여 옛 코드가 박힌 이미지가 그대로
#    재배포되는 사고가 있었다(예: 라우트 추가가 반영 안 됨 → 운영에서 404/옛 화면).
#    git 은 origin/main 으로 reset 됐는데도 빌드 산출물만 옛것이라 탐지가 어렵다.
#    correctness 우선으로 캐시를 끈다(앱 이미지 install/build 재실행: 배포가 다소 느려짐).
#    `build:` 블록이 있는 앱 이미지에만 적용되고 `image:` 서비스(postgres/nginx 등)는 무관.
#    base 이미지(csc/node-base, python-base)는 위 1) 에서 이미 빌드되어 FROM 으로 재사용된다.
cd "$COMPOSE_DIR"
docker compose -f "$COMPOSE_FILE" build --no-cache "${SERVICES[@]}"

# 2b) 논리 DB 보장(ensure): initdb 의 CREATE DATABASE 는 "빈 데이터 디렉터리 첫 기동"에만 돈다.
#     기존 볼륨에 새 논리 DB(media 등)가 추가돼도 자동 생성되지 않으므로, 멱등 initdb SQL 을
#     매 배포마다 db 에 재적용해 누락 DB 를 만든다. db 서비스가 있는 스택(web)만: ai 는 자동 skip.
if docker compose -f "$COMPOSE_FILE" config --services | grep -qx db; then
  echo "논리 DB 보장(ensure)..."
  docker compose -f "$COMPOSE_FILE" up -d db
  db_cid="$(docker compose -f "$COMPOSE_FILE" ps -q db)"
  for i in $(seq 1 20); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$db_cid" 2>/dev/null)" = "healthy" ] && break
    if [ "$i" -eq 20 ]; then
      echo "db 헬시 대기 실패: 논리 DB ensure 중단" >&2
      exit 1
    fi
    sleep 3
  done
  # 컨테이너 내부 $POSTGRES_USER 로 maintenance DB(postgres)에 접속해 멱등 SQL 적용.
  docker compose -f "$COMPOSE_FILE" exec -T db \
    sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/01-create-databases.sql'
fi

# 2c) DB 마이그레이션: 앱 기동 "전"에 일회성 db-migrate 컨테이너로 적용한다.
#     - 해당 스택에 db-migrate 서비스가 있을 때만 실행(web 스택만 보유, ai 스택은 자동 skip).
#     - drizzle-kit migrate 는 __drizzle_migrations 추적으로 멱등 → 재배포 안전.
#     - 실패하면 set -e 로 여기서 중단 → 옛 컨테이너 그대로(무중단), 스키마-코드 mismatch 가 안 나감.
if docker compose -f "$COMPOSE_FILE" --profile migrate config --services | grep -qx db-migrate; then
  echo "DB 마이그레이션..."
  docker compose -f "$COMPOSE_FILE" run --rm --build db-migrate
fi

docker compose -f "$COMPOSE_FILE" up -d --remove-orphans "${SERVICES[@]}"

# 3) 준비 확인: 모든 컨테이너가 'running' 이고 'restarting'/'exited' 가 없는지 최대 60초 대기.
echo "준비 확인..."
for i in $(seq 1 20); do
  bad="$(docker compose -f "$COMPOSE_FILE" ps --format '{{.Name}} {{.State}}' \
        | awk '$2 != "running" {print}')"
  if [ -z "$bad" ]; then
    echo "  OK: 모든 서비스 running"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "일부 서비스가 뜨지 않음:" >&2
    echo "$bad" >&2
    docker compose -f "$COMPOSE_FILE" ps >&2
    echo "--- 최근 로그 ---" >&2
    docker compose -f "$COMPOSE_FILE" logs --tail=50 >&2
    exit 1
  fi
  sleep 3
done

# 4) nginx 가 있는 스택(web)이면 reload: 마운트된 conf 변경 적용 + 업스트림(web-groupware 등) 재해석.
#    배포로 컨테이너가 재생성되며 IP 가 바뀌어도 옛 IP 로 가지 않도록 즉시 갱신한다(ai 스택은 nginx 없어 skip).
if docker compose -f "$COMPOSE_FILE" ps --services 2>/dev/null | grep -qx nginx; then
  echo "nginx reload..."
  docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload 2>/dev/null \
    || echo "  (nginx reload 건너뜀: 미기동?)"
fi

docker compose -f "$COMPOSE_FILE" ps

# 5) 디스크 회수. 배포마다 도는 유일한 정리 지점이라 두 종류를 다 여기서 처리한다.
# 5a) 떠다니는(dangling) 이미지: 새 빌드가 태그를 가져가며 옛 이미지가 태그를 잃는다.
docker image prune -f >/dev/null 2>&1 || true
# 5b) 빌드 캐시 상한. 위 2) 의 build 는 --no-cache 라 앱 빌드 캐시를 재사용하지 않지만,
#     BuildKit 은 그래도 매 배포마다 새 엔트리를 쓴다. 그래서 아무도 읽지 않는 캐시가
#     배포 횟수만큼 쌓인다(방치해서 21,804 엔트리 / 1.2TB 까지 자란 적이 있다.
#     회수가능 99%: 즉 전부 죽은 캐시였다).
#     전량(-af)으로 지우지 않는 이유: base 이미지(위 1)는 --no-cache 없이 빌드해서
#     레이어 캐시를 실제로 재사용한다. 전량 삭제하면 매 배포가 base 를 처음부터 만든다.
#     30GB 는 base 두 개의 캐시가 넉넉히 들어가고 앱 쪽 잔여는 곧 밀려나는 크기다.
#     실패해도 배포는 계속한다(정리는 배포의 성공 조건이 아니다). 다만 조용히 넘기지 않는다.
#     이 줄이 실패한 채 방치되면 캐시가 다시 TB 단위로 자라기 때문이다. --keep-storage 는
#     docker 29 에서 동작하나 후속 버전에서 --reserved-space 로 대체될 수 있다.
docker builder prune -f --keep-storage=30GB >/dev/null 2>&1 \
  || echo "  경고: 빌드 캐시 정리 실패. docker builder prune 의 --keep-storage 지원을 확인할 것."
echo "[$ENV_NAME] 배포 완료"
