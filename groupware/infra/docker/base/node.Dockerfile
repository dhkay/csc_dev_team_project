# csc/node-base: Node + pnpm 공통 빌드 툴체인.
# 모든 node 계열 앱(SvelteKit/NestJS) Dockerfile 이 `FROM csc/node-base` 로 재사용한다.
# 툴체인 버전/패치는 여기 한 곳에서만 관리한다(단일 진실원).
#
# 빌드: docker build -t csc/node-base:latest -f infra/docker/base/node.Dockerfile infra/docker/base
FROM node:22-slim

# pnpm 고정 버전 (루트 package.json 의 packageManager 와 일치).
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

WORKDIR /repo
