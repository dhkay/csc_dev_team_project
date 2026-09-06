# @csc/database 마이그레이션 러너: drizzle-kit migrate 를 NestJS 소유 DB 에 적용하고 종료.
# 장기 실행 서비스가 아니라 일회성 컨테이너다(앱 기동 전에 scripts/deploy/deploy.sh 가 실행).
#
# 빌드 컨텍스트 = 모노레포 루트:
#   docker build -t csc/db-migrate:staging -f packages/database/Dockerfile .
FROM csc/node-base:latest
WORKDIR /repo

# 모노레포 전체 복사(.dockerignore 가 node_modules/dist/.env 제외) 후
# database 패키지 의존성만 설치(drizzle-kit 포함. 마이그레이션 실행에 필요).
COPY . .
RUN pnpm install --frozen-lockfile --filter @csc/database

WORKDIR /repo/packages/database
ENTRYPOINT ["bash", "scripts/migrate-all.sh"]
