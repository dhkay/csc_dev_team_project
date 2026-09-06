#!/usr/bin/env bash
# ESCOA → CSC 리브랜드 1회 컷오버: Docker 네임드 볼륨 데이터 이관.
#
# compose 프로젝트명이 escoa-{env}-web → csc-{env}-web 으로 바뀌면서 네임드 볼륨 prefix 도
# escoa-*_<vol> → csc-*_<vol> 로 바뀐다. 기존 데이터(Postgres pg_data, certbot 인증서)가
# orphan 되지 않도록, 새 이름 볼륨으로 데이터를 복사한다.
#
# 실행 위치: web-server (staging+prod web 스택의 데이터가 여기 있음). video-ai-server 는 볼륨 없음.
# 전제: 대상 스택을 먼저 down 해서 볼륨을 쓰는 컨테이너가 없어야 한다(pg_data 정합성).
# 안전: 기존 escoa-* 볼륨은 삭제하지 않는다(검증 후 수동 정리 → 롤백 백업).
set -euo pipefail

# old_project : new_project : volume  (ai 스택은 볼륨 없음 → 제외)
PAIRS=(
  "escoa-prod-web:csc-prod-web:pg_data"
  "escoa-prod-web:csc-prod-web:certbot_certs"
  "escoa-prod-web:csc-prod-web:certbot_webroot"
  "escoa-staging-web:csc-staging-web:pg_data"
)

vol_exists() { docker volume inspect "$1" >/dev/null 2>&1; }
vol_empty()  { [ -z "$(docker run --rm -v "$1":/v alpine sh -c 'ls -A /v 2>/dev/null')" ]; }

echo "== ESCOA→CSC 볼륨 이관 시작 (기존 볼륨은 보존) =="
for p in "${PAIRS[@]}"; do
  IFS=: read -r oldp newp vol <<<"$p"
  src="${oldp}_${vol}"; dst="${newp}_${vol}"
  echo "── ${src} → ${dst}"
  if ! vol_exists "$src"; then echo "  (skip) 원본 ${src} 없음"; continue; fi
  if vol_exists "$dst" && ! vol_empty "$dst"; then echo "  (skip) 대상 ${dst} 이미 데이터 있음"; continue; fi
  docker volume create "$dst" >/dev/null
  docker run --rm -v "$src":/from:ro -v "$dst":/to alpine \
    sh -c 'cp -a /from/. /to/ && echo "  복사 완료: $(du -sh /to 2>/dev/null | cut -f1)"'
done
echo "이관 완료. 검증 후 기존 볼륨 정리: docker volume ls | grep escoa- → docker volume rm <...>"
