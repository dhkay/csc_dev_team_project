# develop_status.md

## 프로젝트 개요 및 목적

`csc_project` — 헥사고날(Ports & Adapters) 백엔드 + SvelteKit 프론트엔드로 구성된 모노레포.
원래 `C:\Users\kimja\OneDrive\Desktop\csc_project-main\csc_project-main`에 있던 프로젝트 전체를
2026-09-02에 `/var/www/groupware`로 이동했다 (원본은 이동 후 삭제됨). 이후 그룹웨어를 실제로
브라우저에서 접속 가능한 상태까지 기동 완료했다.

- **백엔드**: 헥사고날(Ports & Adapters). NestJS(Drizzle) + FastAPI(SQLAlchemy/Alembic, uv).
- **프론트엔드**: SvelteKit (FSD 변형, BFF).
- **데스크톱**: SvelteKit(adapter-static) + Tauri (오프라인 우선, 로컬 SQLite + 동기화 큐).
- **DB 소유권**: 한 DB는 한 서버만 직접 소유, 타 도메인은 HTTP + 서비스 토큰으로 호출.

## 전체 파일 구조 (파일맵)

```
/var/www/groupware/
├── apps/
│   ├── api/
│   │   ├── nestjs/   csc-groupware, csc-control-tower, user, csc-marketing, csc-mes
│   │   └── fastapi/  language-model, video-model, file-upload, log-server, data-collector, metrics-agent
│   ├── web/           groupware, control-tower  (SvelteKit BFF 프론트)
│   ├── desktop/        mes (현장 PC 앱: SvelteKit adapter-static + Tauri)
│   └── tools/           scalar-gateway (통합 API 문서 포털)
├── packages/           database, shared-ui, net-utils, entitlements, mes-contracts,
│                        log-client, log-contracts, pricing, api-providers, saga,
│                        tool-versions, video-capabilities
├── infra/
│   ├── docker/         base, comfyui, dev/{ai,web}, prod/{ai,web}, staging/{ai,web}
│   │                    ⚠ infra/docker/dev/web/.env 는 로컬 전용(gitignore, STORAGE_HOST_DIR을
│   │                      /home/ubuntu/csc-storage/dev 로 오버라이드)
│   ├── nginx/           conf.d/cscuniverse.conf 등 (prod 리버스 프록시 설정)
│   └── firewall/
├── docs/                아키텍처/스펙 문서 (structure-blueprint.md 등)
├── scripts/             dev.mjs, kill.mjs, check-*.mjs 등 모노레포 유틸 스크립트
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml, turbo.json
└── README.md
```

## 주요 기능 목록 및 상세 설명

- **csc-groupware (API + Web)**: 그룹웨어 도메인 (조직 API 자격증명, AI 어시스턴트 설정 등). `groupwaredb` 단독 소유.
- **csc-control-tower**: 서버 모니터링/제어 타워.
- **csc-marketing**: 마케팅 영상 기획/생성 도메인.
- **csc-mes**: 제조실행시스템, 현장 PC용 Tauri 데스크톱 앱과 통신 (BFF 미경유).
- **language-model / video-model / file-upload / log-server / data-collector**: FastAPI 기반 지원 서비스.
- **scalar-gateway**: 전체 API 문서 통합 포털 (dev 스택에는 미포함, 필요시 `pnpm --filter @csc/scalar-gateway dev`).
- **infra/docker/dev/web/docker-compose.yml**: 로컬 개발용 백엔드 전체(Postgres, Redis, Kafka, ClickHouse, Qdrant + NestJS 5개 + FastAPI 6개) 오케스트레이션.

## 현재 작업 진행 상태 — ✅ 그룹웨어 브라우저 접속 가능 (2026-09-02 완료)

- [x] 원본(OneDrive) 전체 모노레포 파일(2383개, ~13.4MB) `/var/www/groupware`로 이동, 원본 삭제.
- [x] `pnpm install` 완료 (28 workspace, 959 packages).
- [x] `ubuntu` 계정을 `docker` 그룹에 추가 (sudo 비번 없이 도커 사용 가능하도록; `wsl.exe -u root usermod -aG docker ubuntu`).
- [x] base 이미지 빌드: `bash scripts/deploy/build-base-images.sh` (csc/node-base, csc/python-base).
- [x] **버그 수정**: `infra/docker/dev/web/docker-compose.yml`의 `api-file-service`/`api-file-service-worker`/
      `api-video-model` 3개 서비스가 build `context`를 자기 앱 폴더(`apps/api/fastapi/file-upload`,
      `apps/api/fastapi/video-model`)로 잘못 잡고 있었음(Dockerfile은 `apps/api/fastapi` 상위 폴더 기준
      `COPY net-utils`, `COPY video-model` 등을 사용 — 다른 FastAPI 서비스는 정상적으로 상위 폴더를 context로 씀).
      → context를 `../../../../apps/api/fastapi` + `dockerfile: <app>/Dockerfile` 형태로 수정.
- [x] `docker network create csc-ai` (language-model 서비스가 요구하는 external 네트워크).
- [x] `/root/Group_ware`에 11일 전부터 존재하던 **구버전 프로젝트의 도커 컨테이너**(`gw-dev-db`,
      `gw-dev-api-csc-groupware`, 포트 6000/6432 점유)를 사용자 확인 후 정지/제거
      (`docker compose -f /root/Group_ware/infra/docker/dev/groupware/docker-compose.yml down`).
      ⚠ `/root/Group_ware` 디렉토리 자체는 삭제하지 않고 남겨둠 — 필요시 별도 정리 요청 시 처리.
- [x] `infra/docker/dev/web` 전체 백엔드 16개 컨테이너 기동 완료, DB 마이그레이션(groupwaredb 등 5개) 성공,
      8개 API(`/docs`) 전부 200 응답 확인.
- [x] `web-groupware` 프론트엔드를 `pnpm exec turbo run dev --filter=@csc/web-groupware`로 기동
      (turbo가 의존 workspace 패키지 `@csc/net-utils`, `@csc/entitlements`, `@csc/pricing` 등을
      `^build`로 먼저 빌드 — `pnpm --filter ... dev` 단독 실행 시 이 빌드가 빠져 `Failed to resolve entry`
      에러 발생했었음, turbo 경유로 해결).
      `PRIVATE_API_URL=http://localhost:6000/`, `PRIVATE_STORAGE_API_URL=http://localhost:6011/` 로
      docker 백엔드에 연결.
- [x] Windows 브라우저에서 `http://localhost:5173` → `http://localhost:5173/login` 정상 접속 확인
      (WSL2 자동 localhost 포트포워딩으로 Windows 쪽에서도 그대로 열림).

### 접속 방법 / 로그인 계정

| 항목 | 값 |
|---|---|
| **그룹웨어 웹(브라우저)** | http://localhost:5173 (→ 자동으로 /login 이동) |
| **로그인 ID** | `admin@gmail.com` |
| **로그인 비밀번호** | `Gusn3063!` (정책상 대문자+특수문자 필요해 `gusn3063`에서 조정됨) |
| 소속 조직 | `테스트 조직` (slug: `demo`), 역할 ROOT |
| control-tower 플랫폼 관리자(동일 이메일, 별도 계정) | http://localhost:6001 (API만, 프론트엔드 web-control-tower는 미기동) — 같은 이메일/비밀번호 |
| csc-groupware API 문서 | http://localhost:6000/docs |
| api-user(계정/인증) API 문서 | http://localhost:6002/docs |
| api-csc-control-tower(플랫폼관리) API 문서 | http://localhost:6001/docs |
| 기타 API | csc-marketing :6003, csc-mes :6004, file-service :6011, video-model :6012, language-model :6013, data-collector :6014, log-server :6015 |

**계정 생성 경위**: `infra/docker/dev/web/docker-compose.yml`에 원래 없던 `api-user`(계정/인증, userdb 소유)와
`api-csc-control-tower`(조직 생성 API) 두 서비스를 staging compose를 참고해 추가 → 기동 → `PLATFORM_ROOT_EMAIL/PASSWORD`로
플랫폼 관리자 자동 시드 → 그 계정으로 `POST /platform/organizations` 호출해 조직 "테스트 조직"(slug: demo) + ROOT 계정 생성.

### 현재 떠 있는 프로세스 (재시작 시 참고)

- **Docker (16개 컨테이너)**: `cd /var/www/groupware/infra/docker/dev/web && docker compose up -d` 로 재기동.
  이미 빌드된 이미지가 있으므로 `--build` 불필요(코드 변경 시에만 다시 필요).
- **web-groupware (vite dev, 5173)**: 터미널에서 직접 기동 시
  `cd /var/www/groupware && PRIVATE_API_URL=http://localhost:6000/ PRIVATE_STORAGE_API_URL=http://localhost:6011/ pnpm exec turbo run dev --filter=@csc/web-groupware`
  (백그라운드 프로세스로 떠 있음. 세션 재시작 시 다시 실행 필요 — systemd/pm2 등록 안 됨).

## 최근 변경 이력

- **2026-09-02**: OneDrive → `/var/www/groupware` 이동. 백엔드 도커 스택 + 프론트엔드 dev 서버까지
  기동하여 `localhost:5173`에서 그룹웨어 접속 가능한 상태로 완료. `docker-compose.yml`의 build context
  버그 수정. `/root/Group_ware`의 구버전 컨테이너 정리.

## 미완료 작업 및 TODO

- `web-control-tower`(control-tower 앱), `scalar-gateway` 등은 아직 안 띄움 — 필요시 요청.
- `/var/www/groupware` 디렉토리 및 하위 파일 권한이 `777`(rwxrwxrwx)로 복사되어 있음 — 보안상 조정 검토 필요.
- `/root/Group_ware` 디렉토리(구버전) 자체는 아직 남아있음 — 완전 정리를 원하면 별도 요청 필요(삭제는
  CLAUDE.md 정책상 이동/백업으로 대체 권장).
- 그룹웨어에 실제 로그인하려면 조직/계정 시딩(seed) 데이터가 있는지 확인 필요 — 현재 DB는 마이그레이션만
  적용된 빈 상태일 수 있음.
- docker/vite 프로세스 모두 세션 종료 시 함께 종료될 수 있음 — 영속적으로 띄우려면 `systemd`, `pm2`,
  또는 `docker compose` restart policy(`unless-stopped`, 이미 백엔드 컨테이너는 적용됨) 검토.

## 알려진 버그 또는 이슈

- `infra/docker/dev/web/docker-compose.yml`의 build context 버그는 수정 완료(위 참고). 원본 저장소에
  같은 문제가 있을 수 있으니 향후 `git diff`로 이 수정사항을 팀에 공유하는 것을 권장.
