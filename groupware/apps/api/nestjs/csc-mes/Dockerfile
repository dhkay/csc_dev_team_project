# api-csc-mes (NestJS).
# 빌드 컨텍스트 = 모노레포 루트.
#   docker build -t csc/api-csc-mes:staging -f apps/api/nestjs/csc-mes/Dockerfile .

FROM csc/node-base:latest AS build
COPY . .
# `--filter "<app>..."` = 앱 + 의존 워크스페이스 패키지만 설치한다. 기존 백엔드 Dockerfile 은
# 필터 없이 전체를 설치하는데, 워크스페이스에 데스크톱 앱(@tauri-apps/cli 등)이 들어온 뒤로는
# 그 방식이 모든 백엔드 이미지에 불필요한 의존성을 끌어온다. 신규 서버는 필터를 건다.
RUN pnpm install --frozen-lockfile --filter "@csc/api-csc-mes..."
RUN pnpm --filter "@csc/api-csc-mes..." build
RUN pnpm --filter "@csc/api-csc-mes" deploy --prod /out

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build /out ./
EXPOSE 3000
CMD ["node", "dist/main"]
