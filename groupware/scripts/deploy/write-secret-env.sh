#!/usr/bin/env bash
# 배포 직전, compose 가 읽는 .env 에 시크릿을 주입(키 단위 upsert)한다.
#
# CI 워크플로(deploy-staging.yml / deploy-prod.yml)가 GitHub Secrets 를 환경변수로 넣어주고,
# 이 스크립트가 그 중 "비어있지 않은 키만" .env 에 기록한다. 스택에 따라 일부 키만 주입되며
# (web 스택=전부, ai 스택=SERVICE_TOKEN_SECRET 만), 미주입 키는 건너뛴다.
#
# - upsert: 같은 키의 기존 라인만 교체하고 .env 의 다른 라인(운영 설정 등)은 보존한다.
# - 비밀은 깃/이미지에 굽지 않는다. 오직 서버의 .env(gitignore) 에만 기록된다.
# - 값은 마스킹 없이 echo 하지 않는다(GitHub 로그 노출 방지).
#
# 사용: scripts/deploy/write-secret-env.sh <env-file-path>
set -euo pipefail

# 생성하는 .env / 임시파일을 소유자 전용(0600, 디렉터리 0700)으로: 시크릿 평문 파일 권한 강화.
umask 077

ENV_FILE="${1:?대상 .env 경로 필요}"

# 주입 대상 키: 토큰 서명/서버간 인증/플랫폼 슈퍼관리자 + 조직 자격증명 at-rest 암호화 키. (DB 볼륨
# 초기화에 묶인 POSTGRES_PASSWORD 는 의도적으로 제외: 배포마다 바꾸면 기존 DB 인증이 깨진다.)
#   *_SECRET_ENC_KEY 는 한 번 정하면 고정할 것: 바뀌면 이미 저장된 암호문(등록된 API 키)을 복호화 못 한다.
#   (GitHub Secret 미설정 시 이 스크립트가 건너뛰므로, 서버 .env 에 수동으로 넣은 값은 그대로 보존된다.)
KEYS=(SERVICE_TOKEN_SECRET REDIS_PASSWORD CLICKHOUSE_PASSWORD JWT_SECRET JWT_REFRESH_SECRET PLATFORM_ROOT_EMAIL PLATFORM_ROOT_PASSWORD SWAGGER_USER SWAGGER_PASSWORD GROUPWARE_SECRET_ENC_KEY MARKETING_SECRET_ENC_KEY)

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

written=0
for key in "${KEYS[@]}"; do
  value="${!key:-}"
  [ -n "$value" ] || continue
  grep -v "^${key}=" "$ENV_FILE" > "$ENV_FILE.tmp" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  written=$((written + 1))
done

echo ".env 시크릿 주입 완료: $ENV_FILE (${written}개 키)"
