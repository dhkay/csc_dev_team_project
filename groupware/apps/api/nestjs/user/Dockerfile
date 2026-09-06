# api-user (NestJS: 인증/계정 게이트키퍼).
# 빌드 컨텍스트 = 모노레포 루트.
#   docker build -t csc/api-user:staging -f apps/api/nestjs/user/Dockerfile .

FROM csc/node-base:latest AS build
COPY . .
RUN pnpm install --frozen-lockfile
# `<app>...` = 앱 + 의존 워크스페이스 패키지(위상순서). 상세: infra/docker/README.md
RUN pnpm --filter "@csc/api-user..." build
RUN pnpm --filter "@csc/api-user" deploy --prod /out

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build /out ./
EXPOSE 3000
CMD ["node", "dist/main"]
