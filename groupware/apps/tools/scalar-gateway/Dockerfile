# scalar-gateway: 통합 API 문서 포털(내부 전용).
# 빌드 컨텍스트 = 모노레포 루트 (pnpm 워크스페이스 + packages 접근).
#   docker build -t csc/scalar-gateway:staging -f apps/tools/scalar-gateway/Dockerfile .

FROM csc/node-base:latest AS build
COPY . .
RUN pnpm install --frozen-lockfile
# `<app>...` = 앱 + 의존 워크스페이스 패키지(위상순서). 상세: infra/docker/README.md
RUN pnpm --filter "@csc/scalar-gateway..." build
# dist + prod 의존성을 /out 에 self-contained(hoisted)로 가지치기.
RUN pnpm --filter "@csc/scalar-gateway" deploy --prod /out

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build /out ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
