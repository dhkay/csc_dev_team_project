#!/usr/bin/env bash
# NestJS 소유 DB(groupwaredb / userdb / controltowerdb / marketingdb / mesdb) Drizzle
# 마이그레이션을 순서대로 적용.
#
# - DB별 연결 URL 은 환경변수로 주입한다:
#     GROUPWARE_DATABASE_URL / USER_DATABASE_URL / CONTROLTOWER_DATABASE_URL
#     MARKETING_DATABASE_URL / MES_DATABASE_URL
# - 아직 마이그레이션 파일이 없는 DB(빈 스키마)는 건너뛴다 → 도메인 추가 시 자동 포함.
# - drizzle-kit migrate 는 __drizzle_migrations 로 적용 여부를 추적하므로 멱등(재실행 안전).
set -euo pipefail
cd "$(dirname "$0")/.."   # → packages/database

migrate_db() {
  local db="$1" script="$2"
  if [ -f "src/$db/migrations/meta/_journal.json" ]; then
    echo "▶ [$db] 마이그레이션 적용"
    pnpm run "$script"
  else
    echo ", [$db] 마이그레이션 없음. 건너뜀"
  fi
}

# 순서: groupwaredb → userdb → controltowerdb (database-migration-workflow.md 와 동일)
migrate_db groupwaredb    drizzle:migrate:groupware
migrate_db userdb         drizzle:migrate:user
migrate_db controltowerdb drizzle:migrate:controltower
migrate_db marketingdb    drizzle:migrate:marketing
migrate_db mesdb          drizzle:migrate:mes

echo "모든 DB 마이그레이션 완료"
