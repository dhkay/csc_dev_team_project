# 배포 가이드 (staging / prod): LAN 팀원용

같은 로컬 네트워크(LAN)에 있는 팀원이 staging, prod 환경에 배포하는 방법.

## 한눈에 보기

```
팀원: staging 브랜치에 머지  ──►  Deploy to staging  ──►  자동 배포
      main    브랜치에 머지  ──►  Deploy to prod     ──►  자동 배포 (초기 단계)
                                       │
                          ┌────────────┴────────────┐
                          ▼                          ▼
               web-server self-hosted 러너   video-ai-server self-hosted 러너
        (web/nestjs/file-service/video-model/redis)  (media-worker)
                          │                          │
                          ▼                          ▼
               git 동기화 → scripts/deploy/deploy.sh → docker compose up -d --build
```

> **왜 SSH 가 아니라 self-hosted 러너인가?** 서버가 LAN(사설망)에 있어 GitHub 클라우드에서
> 인바운드로 접속할 수 없다. 대신 서버의 러너가 **outbound 로** 잡을 가져가 로컬에서 배포한다.
> → 공인 IP, SSH 포트를 외부에 열 필요가 없고, GitHub Secrets 에 IP/키를 넣지 않아도 된다.

## 환경 비교

| 항목 | staging | prod |
|------|---------|------|
| 트리거 브랜치 | `staging` push/머지 | `main` push/머지 |
| 배포 방식 | 자동 | 자동 (초기 단계: 추후 수동 승인 전환 가능) |
| 워크플로 | [.github/workflows/deploy-staging.yml](../../.github/workflows/deploy-staging.yml) | [.github/workflows/deploy-prod.yml](../../.github/workflows/deploy-prod.yml) |
| 러너 라벨 | `web-server` / `video-ai-server` (공용) | `web-server` / `video-ai-server` (동일 러너 재사용) |
| 서버 클론 경로(기본) | `~/Projects/csc_project/staging` | `~/Projects/csc_project/prod` |
| compose 프로젝트명 | `csc-staging-web` / `csc-staging-ai` | `csc-prod-web` / `csc-prod-ai` |
| compose 경로 | `infra/docker/staging/{web,ai}/` | `infra/docker/prod/{web,ai}/` |

> staging 과 prod 는 **같은 서버에 공존**한다. compose 프로젝트명, 호스트 포트, DB 볼륨이 모두
> 분리되어 서로 간섭하지 않는다.

## 포트 매핑 (호스트 포트)

| 서비스 | staging | prod | 서버 |
|--------|--------:|-----:|------|
| **nginx (외부 노출)** | 없음 | **80 / 443** | web-server |
| web-groupware | 5173 | 4173 | web-server |
| web-control-tower | 5174 | 4174 | web-server |
| api-csc-groupware | 3000 | 4000 | web-server |
| api-csc-control-tower | 3001 | 4001 | web-server |
| api-user | 3002 | 4002 | web-server |
| api-csc-marketing | 3003 | 4003 | web-server |
| api-file-service | 8001 | 9001 | web-server |
| api-video-model | 8002 | 9002 | web-server |
| api-data-collector | 3005 | 4005 | web-server |
| api-log-server | 3006 | 4006 | web-server |
| api-csc-mes | 3004 | 4007 | web-server |
| api-language-model | 8003 | 4004 | web-server |
| scalar-gateway | 3300 | 4300 | web-server |
| redis (arq 큐) | 6379 | 6380 | web-server |
| media-worker (arq) |: (인바운드 없음) | 없음 | video-ai-server |
| Postgres | 컨테이너 내부 5432 (미노출) | 동일 | 각 서버 |

> **미디어 파이프라인**: web-server 가 file-service, video-model(API), redis, `videomodeldb` DB 를 보유하고,
> video-ai-server 는 무상태 `media-worker`(arq) 만 돌리며 web-server 의 redis/file-service/video-model 에
> LAN 으로 접속한다(서비스토큰 + redis requirepass 로 보호). 자세한 토폴로지는
> [docs/workspace/file-storage-architecture.png](../../docs/workspace/file-storage-architecture.png).

> **video-ai-server 자원 공유(web-server 와 다른 정책)**: web-server 는 상태(redis/DB/디스크)를 갖기에
> staging/prod 를 물리적으로 분리하지만, video-ai-server 는 **무상태**라 staging 과 prod 가 **같은 하드웨어를 공유**한다.
> 단 별도 compose 프로젝트(`csc-staging-ai` / `csc-prod-ai`), 별도 컨테이너, 별도 이미지(`:staging`/`:prod`), 
> 별도 web-server 엔드포인트(prod redis 6380 / staging 6379)로 분리되어 **나란히** 돈다. 배포 아티팩트, 큐, 연결은
> env 분리, 하드웨어만 공유(단일 워커가 두 env 큐를 함께 먹지 않음 → 롤백/카나리 단위 유지). worker 는 인바운드
> 포트가 없어 두 스택이 포트 충돌 없이 공존한다. **noisy-neighbor 방지**: prod 우선 정책을 compose 자원 키로 건다.
> prod `cpu_shares=1024`/`mem_limit=6g`/`WORKER_MAX_JOBS=6`(cpus 상한 없음 → idle 시 버스트),
> staging `cpu_shares=256`/`cpus=1.5`/`mem_limit=2g`/`WORKER_MAX_JOBS=2`(best-effort). 값은 각 `ai/.env` 로 조정.
>
> 위 캡, `WORKER_MAX_JOBS` 는 **ffmpeg/미디어 컴퓨트(CPU, 메모리, 디스크)** 전용이다. **LLM 호출(GENERATE/AI)은
> 네트워크 I/O** 라 코어/메모리 캡의 대상이 아니며, 동시성은 **전용 세마포어로 별도 제한**한다(프로바이더
> rate-limit/비용 기준, `LLM_MAX_CONCURRENCY`: GENERATE 배선 시 추가). 두 축을 섞지 않는다.
>
> **외부 영상 벤더 한도**는 셋째 축이다. 벤더는 조직 키(프로젝트) 단위로 분당 제출 수를 재고, 같은 키를
> staging 과 prod 가 함께 쓰면 둘을 합산한다. 한도의 1차 출처는 조직이 API 키와 함께 등록한 값(그룹웨어 API 키
> 화면의 "분당 영상 생성 요청 상한")이고, 워커의 `*_SUBMITS_PER_MINUTE`(키별 제출 간격, 0 = 없음)은 그 값이
> 없는 키의 기본값이다. `*_THROTTLE_MAX_RETRIES`(429 백오프)는 워커 설정이다. 기본값은 두 env 의 합이 대시보드
> RPM 을 넘지 않게 나눈다(prod 4 + staging 2). `COMPOSE_SEGMENT_PARALLELISM` 은 한 잡이 겹쳐 기다리는 씬 수라
> 제출 빈도와 별개다.

> prod 의 4173 등 앱 호스트 포트는 **`127.0.0.1` 바인딩(호스트 로컬 디버그용)** 이다. nginx 는 이
> 포트가 아니라 **도커 네트워크의 서비스명**(`web-groupware:3000` 등)으로 upstream 에 접근한다.
> 외부 노출은 **nginx 80/443 뿐**이며, 앱 호스트 포트는 LAN/라우터 어디에도 노출하지 않는다.
> (staging 은 기존대로 0.0.0.0: 외부 미연결 환경)

---

## 외부 노출 / 도메인 (prod: cscuniverse.com)

prod groupware 프론트를 **cscuniverse.com** 으로 공개한다. Cloudflare 를 쓰지 않고
**web-server 가 직접 호스팅**한다. nginx 가 단일 관문으로 TLS 종단 + 접근제한 + 프록시를 담당한다.

```
브라우저(허용 IP) ─ cscuniverse.com ─► 라우터 ─80/443─► web-server(192.168.0.26)
                                                       └─ nginx ─► web-groupware:3000
```

- **TLS**: Let's Encrypt **HTTP-01**. certbot 컨테이너가 자동 발급/갱신, nginx 는 6h 마다 self-reload.
- **접근제한 정책**: "**이 공인 IP에 연결된 모든 기기 허용, 그 외 전부 차단**".
  - 공인 IP 자체로 들어오는 외부 요청 + 같은 라우터 뒤 사내 LAN 전체 허용. hairpin NAT 로 사내 접속은 사설 IP(`192.168.0.0/24`)로 찍히므로 LAN 대역도 함께 허용한다.
  - 허용 목록은 **공인 IP 를 repo 에 두지 않으려고** 서버 전용 파일에서 관리한다:
    `infra/nginx/snippets/cscuniverse-allow.conf` (gitignore). repo 에는 `*.example` 만 커밋.
  - ACME 검증 경로(`/.well-known/acme-challenge/`)만 IP 제한 없이 공개(LE 검증용).
- 설정 파일: [infra/nginx/conf.d/cscuniverse.conf](../nginx/conf.d/cscuniverse.conf): 변경 시 CI/CD(main 머지)로 자동 반영.

### 서버 1회 셋업 (외부 노출: web-server, 관리자)

1) **DNS (가비아)**: A 레코드 `@`, `www` → 사무실 공인 IP. (완료됨)

2) **라우터 포트포워딩**: 외부 80/443 → `192.168.0.26`.
   - **포트 80 은 source IP 제한 금지** (Let's Encrypt 검증 서버가 들어와야 함). 실제 접근제한은 nginx 가 한다.
   - 도커 호스트 포트(4173 등)는 포워딩하지 않는다.

3) **접근 허용 목록 생성**: prod 클론에서 example 복사 후 공인 IP 입력:

   ```bash
   cd ~/Projects/csc_project/prod/infra/nginx/snippets
   cp cscuniverse-allow.conf.example cscuniverse-allow.conf
   nano cscuniverse-allow.conf      # 203.0.113.1 → 사무실 공인 IP 로 교체
   ```

   > 아래 부트스트랩 스크립트가 이 파일이 없으면 example 로 자동 생성한다(공인 IP 는 직접 교체).
   > untracked 파일이라 `git reset --hard`(CI 배포)에도 지워지지 않는다.

4) **인증서 최초 발급 (1회 부트스트랩)**: DNS, 포워딩이 끝난 뒤 prod 클론에서:

   ```bash
   ssh web-server
   cd ~/Projects/csc_project/prod
   git fetch origin && git checkout main && git reset --hard origin/main
   bash scripts/deploy/init-letsencrypt.sh csc@csc.kr
   # 레이트리밋 걱정되면 먼저:  STAGING=1 bash scripts/deploy/init-letsencrypt.sh csc@csc.kr
   ```

   스크립트가 더미 인증서로 nginx 기동 → 실제 인증서 발급 → reload → certbot 데몬 기동까지 수행한다.
   이후부터는 인증서가 named volume(`certbot_certs`)에 영속되어 CI/CD `docker compose up` 이 그대로 유지한다.

> **주의:** 위 부트스트랩 전에 main 머지로 자동 배포가 먼저 돌면, 인증서가 없어 nginx readiness 가
> 실패할 수 있다(다른 서비스는 정상). 부트스트랩을 먼저 수행하거나, 실패 시 부트스트랩 후 재배포한다.

---

## 일상적인 배포 (팀원이 매번 하는 것)

### staging
1. 작업 브랜치 → PR → `staging` 머지(또는 직접 push).
2. 끝. GitHub Actions 가 바뀐 스택만 자동 배포.

### prod
1. `staging` 에서 검증된 변경을 → PR → `main` 머지.
2. 끝. staging 과 동일하게 바뀐 스택만 자동 배포된다 (초기 단계라 승인 게이트 없음).

> 바뀐 경로에 따라 자동으로 web-server / video-ai-server 중 필요한 쪽만 배포된다.
> 수동 트리거: Actions 탭 → 해당 워크플로 → **Run workflow** (workflow_dispatch).

개발자 PC 에는 아무 설정도 필요 없다. push 권한 + (prod 는) 승인 권한만 있으면 된다.
아래 "서버 1회 셋업"이 끝나 있다는 전제하에서다.

---

## 서버 1회 셋업 (서버당 한 번, 관리자)

각 서버(web-server: `192.168.0.26`, video-ai-server: `192.168.0.28`)에서 최초 한 번만.
LAN SSH 접속법은 [.claude/rules/local-network-ssh-access.md](../../.claude/rules/local-network-ssh-access.md) 참고.

> **현재 상태(2026-06 기준):** staging 은 양쪽 서버 모두 러너, 클론이 준비되어 동작 중.
> prod 는 아직 클론이 비어 있다(placeholder). 아래 2)~3) 을 1회 수행하면 prod CI/CD 가
> 활성화된다(초기 단계라 자동 배포, 승인 환경 불필요).

### 1) self-hosted 러너 (이미 등록됨, 라벨 확인용)

워크플로는 라벨로 서버를 고른다. staging, prod 모두 아래 머신 라벨 러너를 공용으로 쓴다.

| 서버 | 필요한 라벨 |
|------|------------|
| web-server | `self-hosted`, `web-server` |
| video-ai-server  | `self-hosted`, `video-ai-server` |

> 러너는 한 번에 잡 1개를 처리한다. staging, prod 가 한 러너 큐를 공유하므로, 동시 배포는
> 순차 처리된다(소규모 트래픽에선 충분). 더 많은 동시성이 필요하면 같은 라벨의 러너를 추가한다.

### 2) prod 저장소 클론 (최초 1회)

워크플로는 정해진 경로에 클론이 있다고 가정한다(없으면 즉시 실패).

```bash
# web-server / video-ai-server 각각
git clone https://github.com/csc-hq/csc_project.git ~/Projects/csc_project/prod
cd ~/Projects/csc_project/prod && git checkout main
```

> 다른 경로를 쓰려면 저장소 Secret `PROD_REPO_DIR`(staging 은 `STAGING_REPO_DIR`)에
> 절대경로를 넣는다(선택). 폴더 경로는 민감정보가 아니며, 미설정 시 위 기본 경로를 쓴다.

### 3) .env 배치 (실제 비밀값)

비밀은 GitHub 가 아니라 **각 서버의 compose 디렉터리 .env** 에서 관리한다.

```bash
# 예: web-server prod
cd ~/Projects/csc_project/prod/infra/docker/prod/web
cp .env.example .env && nano .env      # prod 는 POSTGRES_PASSWORD 필수

# 나머지 조합도 동일: prod/ai, staging/web, staging/ai
```

> prod 는 `.env.example` 의 `POSTGRES_PASSWORD` 를 **반드시** 강한 값으로 채운다(기본값 금지).
> CI 자동 배포 시 `SERVICE_TOKEN_SECRET`, `REDIS_PASSWORD`, `JWT_*` 등은 GitHub Secrets 에서
> `write-secret-env.sh` 가 .env 에 주입한다(필요 Secret: `<ENV>_REDIS_PASSWORD` 신규 추가: web/ai 공통).

### 3b) media DB 생성 (web 스택, 1회)

`videomodeldb`(video_jobs SSoT) DB 는 initdb 가 **빈 postgres 볼륨에서만** 생성한다. 기존 web 스택 postgres 가
이미 있으면(=file_upload 등 다른 DB 가 이미 있는 상태) `videomodeldb` 가 없으므로 최초 1회 수동 생성한다
(다른 논리 DB 를 처음 만들던 것과 동일 패턴). video-model 는 기동 시 이 DB 에 alembic 을 적용한다.

```bash
# 예: web-server, prod (staging 은 경로만 staging 으로)
cd ~/Projects/csc_project/prod
docker compose -f infra/docker/prod/web/docker-compose.yml exec db \
  psql -U csc -tc "SELECT 1 FROM pg_database WHERE datname='media'" | grep -q 1 \
  || docker compose -f infra/docker/prod/web/docker-compose.yml exec db \
       psql -U csc -c "CREATE DATABASE videomodeldb;"
```

> 신규 볼륨(최초 셋업)에서는 initdb 가 자동 생성하므로 이 단계가 필요 없다.

### 4) (선택, 추후) prod 수동 승인 게이트

초기 단계에는 prod 도 자동 배포한다. 운영이 안정되면 수동 승인으로 전환할 수 있다:
deploy-prod.yml 의 각 배포 잡에 `environment: production` 을 추가하고,
저장소 → **Settings → Environments → `production`** 에 **Required reviewers** 를 지정한다.
→ 이후 main 에 머지돼도 승인 전까지 prod 배포가 대기한다.

### 5) 사전 요구사항

- Docker / Docker Compose v2 설치 (확인됨: web 29.1 / ai 29.5)
- 러너 실행 사용자가 docker 그룹에 속해 있을 것 (확인됨)

---

## 수동 배포 (러너 없이, LAN 에서 직접)

러너가 죽었거나 긴급 배포가 필요하면, 서버에 SSH 로 들어가 배포 스크립트를 직접 실행한다.
GitHub Actions 가 하는 일과 동일하다.

```bash
ssh web-server                                   # 또는 ssh video-ai-server
REPO=~/Projects/csc_project/staging            # prod 면 .../prod
cd "$REPO"
git fetch origin && git checkout staging && git reset --hard origin/staging   # prod: main

# 전체 스택
bash scripts/deploy/deploy.sh infra/docker/staging/web/docker-compose.yml
bash scripts/deploy/deploy.sh infra/docker/prod/ai/docker-compose.yml

# 특정 서비스만 (부분 배포)
bash scripts/deploy/deploy.sh infra/docker/prod/web/docker-compose.yml api-csc-groupware
```

스크립트는 base 이미지 빌드 → compose up → 모든 컨테이너 running 확인(최대 60초)까지 수행한다.
환경(staging/prod)은 compose 경로에서 자동 판별한다.

---

## Node 이미지 빌드 규약 (Dockerfile)

pnpm 워크스페이스 패키지(`@csc/*`)는 소스가 아니라 **`dist`(빌드 산출물)로 참조**된다
(`package.json` 의 `exports`). `pnpm install` 은 링크만 하고 빌드하지 않으므로, 앱을 빌드하기
전에 의존 패키지를 먼저 빌드해야 한다. 안 하면 이렇게 깨진다:

```
[commonjs--resolver] Failed to resolve entry for package "@csc/net-utils".
```

그래서 모든 Node Dockerfile 은 **의존성 기반 한 줄**로 빌드한다:

```dockerfile
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@csc/web-groupware..." build
```

- `<app>...` = **앱 + 그 앱이 의존하는 워크스페이스 패키지 전부**. pnpm 이 위상순서로 실행한다.
- `build` 스크립트가 없는 패키지(`@csc/shared-ui` 등)는 자동으로 건너뛴다.
- **패키지 이름을 손으로 나열하지 말 것.** 의존성을 추가할 때 그 목록 갱신을 빠뜨리면 빌드가
  깨지는데, `deploy.sh` 는 git reset 을 먼저 하므로 **서버 소스만 갱신되고 이미지는 옛것이
  그대로 떠 있는** 상태가 된다(화면에 변경이 안 보이지만 코드는 최신). 실제로 겪은 사고다.
- turbo 를 쓰지 않는 이유: `.dockerignore` 가 `.git` 을 제외해 Docker 안에서 turbo 가 git 해싱을
  못 쓴다. 저장소 루트에서 도는 CI 는 turbo 를 쓴다(`turbo.json` 의 `dependsOn: ["^build"]`).

`--frozen-lockfile` 을 쓰는 이유: `pnpm-lock.yaml` 이 커밋돼 있으므로, lockfile 과 package.json 이
어긋나면 **조용히 다른 버전을 설치하는 대신 즉시 실패**해야 이미지가 재현 가능하다.

## 트러블슈팅

| 증상 | 원인 / 대응 |
|------|------------|
| Actions 잡이 계속 `Queued` | 해당 라벨 러너가 오프라인. 서버에서 러너 서비스 상태 확인 |
| `ERROR: ... git 클론이 없음` | 서버에 최초 클론 안 됨 → "서버 1회 셋업 2)" 수행 |
| `일부 서비스가 뜨지 않음` | 스크립트가 최근 로그 50줄 출력. 대개 .env 누락/DB 연결 문제 |
| 포트 충돌(EADDRINUSE) | staging/prod 포트는 분리돼 있음. 외부 프로세스 점유 여부 `docker compose ps` 로 확인 |
| **코드는 최신인데 화면에 반영 안 됨** | 빌드 실패로 이미지가 옛것. 서버에서 이미지 생성 시각과 git reflog 를 비교: `docker image inspect csc/web-groupware:staging --format '{{.Created}}'` vs `git -C ~/Projects/csc_project/staging reflog -3` |
| `Failed to resolve entry for package "@csc/*"` | 위 "Node 이미지 빌드 규약" 참고: 의존 패키지가 빌드되지 않았다 |
| Actions 는 초록인데 배포가 안 됨 | `paths-filter` 에 안 걸려 잡이 **스킵**된 것(수 초 만에 success). 변경 경로가 `web:`/`ai:` 목록에 있는지 확인 |

## 보안: 미디어 파이프라인 교차호스트 포트 (방화벽)

미디어 파이프라인은 **web-server(상태) ↔ video-ai-server(무상태 worker)** 두 호스트로 나뉜다.
worker 가 web-server 의 redis/file-service/video-model 에 **LAN 으로 직접 접속**하므로,
이 포트들은 nginx allowlist 를 거치지 않고 호스트에 바인딩(0.0.0.0)된다. 즉 **방화벽으로
video-ai-server(192.168.0.28) 에서만 들어오도록 제한해야** 한다. 그렇지 않으면 LAN 의 다른 장비가
redis/파일에 직접 닿는다.

| 포트 | 서비스 | 노출 이유 | 허용 출처 |
|------|--------|----------|----------|
| staging 6379 / prod 6380 | redis (arq broker) | worker 가 큐 polling | video-ai-server LAN 만 |
| staging 8001 / prod 9001 | file-service `/blob`, `/files` | worker 가 원본 GET / 결과 PUT | video-ai-server LAN + nginx |
| staging 8002 / prod 9002 | video-model (콜백/상태) | worker 콜백 | video-ai-server LAN 만 |

**1차 방어: redis requirepass:** redis 는 `--requirepass ${REDIS_PASSWORD}` 로 보호한다.
**prod 는 `:?` 로 필수**(미설정 시 `docker compose` 가 기동 거부 = fail-closed). staging 은
기본값 `csc` 로 폴백(빠른 기동용; 운영성 staging 은 .env 로 강한 값 권장).

**2차 방어: ufw(권장, web-server 에서 1회):** cross-host 포트를 video-ai-server 에서만 허용.

```bash
# web-server (192.168.0.26) 에서: video-ai-server(192.168.0.28) 에서 오는 트래픽만 허용
for p in 6379 6380 8001 8002 9001 9002; do
  sudo ufw allow from 192.168.0.28 to any port "$p" proto tcp
done
# 같은 포트로 들어오는 그 외 출처는 거부
for p in 6379 6380 8001 8002 9001 9002; do
  sudo ufw deny "$p"/tcp
done
sudo ufw status numbered
```

> `/files`, `/blob` 는 브라우저 직접 접근도 받으므로(파일 다운로드/업로드), nginx 가 그
> 경로를 공인 IP allowlist(`snippets/cscuniverse-allow.conf`)로 별도 제한한다. ufw 규칙은
> **worker 의 LAN 직결**을 통제하는 것이고, 브라우저 경로는 nginx 가 통제한다(2중).

### 반대 방향: ComfyUI (web-server → video-ai-server)

이미지 생성(내장 FLUX)은 방향이 거꾸로다. **web-server 의 language-model 이 video-ai-server 의
공유 ComfyUI(`csc-ai-comfyui`)를 LAN 으로 호출**한다(호스트가 달라 도커 네트워크가 닿지 않는다).
따라서 규칙도 **ai 호스트에** 넣는다.

**도커 publish 를 쓰지 않는다.** 도커가 넣는 iptables 규칙은 ufw INPUT 을 우회하므로 published 포트는
출처를 좁힐 수 없다(사무실 LAN 전체에 인증 없는 ComfyUI 가 열린다). 대신 ComfyUI 는 `127.0.0.1:8188`
에만 바인딩하고, **LAN 창구는 소비자별 socat 유닛**으로 낸다. 유저스페이스 리스너라 ufw 가 적용된다.

| 창구 | 유닛 | 허용 출처 | 용도 |
|------|------|----------|------|
| 192.168.0.28:8188 | `comfyui-lan-forward.service` | 개발 PC (192.168.0.157) | dev `pnpm dev` 의 language-model |
| 192.168.0.28:8189 | `comfyui-web-forward.service` | web-server (192.168.0.26) | staging/prod 의 `api-language-model` |

두 유닛 모두 `TCP4-LISTEN:<port>,bind=192.168.0.28,fork,reuseaddr,range=<허용IP>:255.255.255.255` 로
`TCP4:127.0.0.1:8188` 에 넘긴다(socat `range` + ufw 2겹). 새 소비자가 생기면 포트 하나와 유닛 하나를 더 만든다.

```bash
# video-ai-server (192.168.0.28) 에서: 새 소비자 추가 예(web-server 용 8189)
sudo tee /etc/systemd/system/comfyui-web-forward.service > /dev/null <<'EOF'
[Unit]
Description=Forward LAN 192.168.0.28:8189 to local ComfyUI 127.0.0.1:8188 (web-server 192.168.0.26 only)
After=network-online.target docker.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/socat TCP4-LISTEN:8189,bind=192.168.0.28,fork,reuseaddr,range=192.168.0.26:255.255.255.255 TCP4:127.0.0.1:8188
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now comfyui-web-forward
sudo ufw allow from 192.168.0.26 to any port 8189 proto tcp

# 검증: 허용 출처에서는 200, 그 외에서는 무응답이어야 한다.
curl -s -o /dev/null -w '%{http_code}\n' http://192.168.0.28:8189/system_stats   # web-server 에서
```

## 보안 원칙 (요약)

- 공인 IP, SSH 키, 실제 비밀값은 **GitHub Secrets / 저장소에 넣지 않는다.** self-hosted 러너가 outbound 로 동작하므로 불필요.
- 런타임 비밀은 **각 서버의 `.env`** 에만 둔다 (`.gitignore` 로 커밋 차단됨).
- 저장소에는 `.env.example`(키 목록 + 안전한 예시값)만 커밋한다.
- prod 는 초기 단계라 자동 배포한다. 운영 안정화 후 `production` 승인 게이트로 전환 가능(셋업 4 참고).
- 전체 보안 설계: [.claude/rules/security-architecture.md](../../.claude/rules/security-architecture.md)
</content>
