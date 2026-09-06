# dev 스택 (csc-dev-web / csc-dev-ai)

미디어 파이프라인을 **dev 환경**에서 staging/prod 와 동일한 토폴로지로 돌린다.
무거운 처리(ffmpeg/AI)는 video-ai-server worker 가 담당하므로 개발자 노트북 사양과 무관하다.

```
노트북(에디터/vite)        web-server(192.168.0.26)            video-ai-server(192.168.0.28)
                           [csc-dev-web]                    [csc-dev-ai]
                           db(6432) redis(6379)               media-worker (arq --watch)
                           api-file-service(6011)             -> web-server LAN 의
                           api-video-model(6012)               redis/file-service/video-model
                           api-csc-groupware(6000)
```

## 포트 (staging/prod 와 충돌 없음)

| 서비스 | host 포트 | 비고 |
|--------|----------|------|
| postgres | 6432 | dev DB (file_upload, media, groupwaredb...) |
| redis | 6379 | 0.0.0.0 (ai worker LAN 접속) |
| api-file-service | 6011 | 0.0.0.0 |
| api-video-model | 6012 | 0.0.0.0 (worker 콜백 수신) |
| api-csc-groupware | 6000 | 미디어 작업 진입점 |
| api-language-model | 6013 | 내부 전용 |
| api-data-collector | 6014 | 내부 전용(csc-marketing / 문서 포털) |
| api-log-server | 6015 | 내부 전용 |

## 기동 (서버에서)

코드를 두 서버 체크아웃에 동기화(git pull 또는 rsync)한 뒤:

```bash
# (공통, 최초 1회 / base Dockerfile 변경 시) 앱 이미지의 FROM 베이스 먼저 빌드.
#   csc/node-base, csc/python-base: 없으면 아래 `up --build` 가
#   `pull access denied: csc/python-base` 로 실패한다. CI/CD(deploy.sh)와 동일한 SSOT 스크립트.
#   Windows 로컬에서 dev 스택을 직접 띄우는 경우 git-bash 로 실행.
bash scripts/deploy/build-base-images.sh

# web-server
cd infra/docker/dev/web
cp .env.example .env            # 필요시 값 수정
docker compose --profile migrate run --rm media-db-migrate   # media DB 1회 마이그레이션
docker compose up -d --build

# video-ai-server (web-server 가 먼저 떠 있어야 worker 가 redis/file-service 에 붙음)
cd infra/docker/dev/ai
cp .env.example .env
docker compose up -d --build
```

## 핫리로드

- 컨테이너는 호스트 `app/` 소스를 bind-mount 한다(이미지의 `.venv` 보존).
- 서버 체크아웃의 `app/` 을 Remote-SSH 로 직접 편집하거나 rsync 로 동기화하면:
  - file-service / video-model: `uvicorn --reload` 가 자동 재기동
  - worker: `arq --watch` 가 자동 재기동
- 재빌드는 의존성(pyproject) 변경 시에만 필요.

## 노트북 (프론트만)

`apps/web/groupware`, `apps/web/control-tower` 만 로컬 `pnpm dev`(vite).

**접속 호스트(중요. 쿠키 격리):** 두 앱을 같은 `localhost` 로 열면 인증 쿠키(host-only)가 섞여
한 앱 로그인이 다른 앱을 로그아웃/403 시킨다. prod 의 도메인 분리를 dev 에서도 재현한다:

| 앱 | dev 접속 URL |
|----|-------------|
| web-groupware | `http://localhost:5173` |
| web-control-tower | `http://admin.localhost:5174` |

> control-tower 는 `localhost:5174` 로 열어도 `admin.localhost:5174` 로 자동 리다이렉트된다
> (hooks.server.ts, dev 전용). 자세한 사유: `.claude/rules/auth-process-flow.md`.

BFF 의 PRIVATE_* 를 web-server dev LAN 으로:

```
PRIVATE_API_URL=http://192.168.0.26:6000          # csc-groupware
PRIVATE_STORAGE_API_URL=http://192.168.0.26:6011  # file-service
```

## 엔드투엔드 점검

```bash
# media 작업 생성 (csc-groupware 경유, 서비스토큰 필요) 또는 video-model 직접 호출
# -> video_jobs: PENDING -> PROCESSING -> COMPLETED
# -> 결과 파일이 web-server STORAGE_HOST_DIR 에 1개, file_upload 메타 1행(idempotency_key=job_id)
```
