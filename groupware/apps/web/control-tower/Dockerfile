# web-control-tower (SvelteKit / adapter-node).
# 빌드 컨텍스트 = 모노레포 루트.
#   docker build -t csc/web-control-tower:staging -f apps/web/control-tower/Dockerfile .

FROM csc/node-base:latest AS build
COPY . .
RUN pnpm install --frozen-lockfile
# `<app>...` = 앱 + 의존 워크스페이스 패키지(위상순서). 상세: infra/docker/README.md
RUN pnpm --filter "@csc/web-control-tower..." build
# adapter-node 는 dependencies 를 번들하지 않고 externalize 한다.
# build/ + prod 의존성(node_modules)을 /out 에 self-contained(hoisted)로 가지치기.
RUN pnpm --filter "@csc/web-control-tower" deploy --prod /out

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build /out ./
EXPOSE 3000
CMD ["node", "build"]
