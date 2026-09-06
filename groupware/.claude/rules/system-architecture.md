# csc 시스템 아키텍처 설계 문서

## 개요

csc_project는 모노레포로, 여러 도메인의 백엔드 서버군과 프론트엔드 BFF 서버, 그리고 공유 패키지를 하나의 저장소에서 함께 관리한다. 백엔드는 헥사고날(Ports & Adapters) 아키텍처를, 프론트엔드는 SvelteKit(페이지 중심 구조: UI 는 `lib/pages/<area>/<page>/<Name>Page.svelte`+`components/`, 클라이언트 상태는 `lib/shared/lib/stores/`, 데이터는 `lib/features/<feature>/` 의 `apis→queries/mutations→services` 레이어로 컴포넌트는 service 만 호출)를 채택한다. 이 문서는 왜 이러한 설계를 선택했는지, 그리고 각 컴포넌트가 어떻게 상호작용하는지를 설명한다.

---

## 전체 아키텍처

이 시스템은 크게 네 개의 레이어로 구성된다.

```
[사용자 브라우저]
    ↓
[프론트엔드 서버] (SSR/BFF)
    ↓
[백엔드 API 서버]
    ↓
[데이터베이스]
```

모노레포는 세 개의 큰 영역으로 나뉜다:

- **apps/api/**: 게이트키퍼 서버군. 각 서버는 자기 DB만 직접 접근하고, 다른 도메인 데이터가 필요하면 HTTP 호출(+ 서비스 토큰)을 사용한다.
- **apps/web/**: BFF(Backend for Frontend) 서버. 브라우저는 자기 web 서버만 호출한다.
- **packages/**: 여러 앱이 공유하는 자산(`database`, `shared-ui`, `net-utils`, `entitlements`). npm scope 는 `@csc` 다. (`entitlements` = 기능/AI도구 카탈로그 key, 라벨의 zero-dep 공유 커널: user 토큰 발급과 web 소비가 공유. 설계: .claude/rules/multi-tenancy.md)

---

## 데이터베이스 분리 전략

### 데이터베이스를 분리한 이유

처음 고민은 "하나의 데이터베이스에 여러 애플리케이션 서버가 접근하는 게 좋은가?"였다. 일반적으로는 여러 서버가 하나의 DB를 공유하는 것이 표준 패턴이다. 하지만 csc의 경우, 그룹웨어 도메인, 컨트롤타워 도메인, 영상 제작 자동화 도메인이 다루는 데이터의 성격이 근본적으로 다르다는 점을 발견했다.

csc의 데이터 저장소는 크게 다음과 같이 나뉜다:

- **groupwaredb / userdb / controltowerdb / marketingdb / mesdb**: `packages/database`(Drizzle ORM)가 스키마를 관리하며, NestJS 서버군(csc-groupware, csc-control-tower, user, csc-marketing, csc-mes)이 각각 하나씩 직접 소유한다. (`userdb` = 인증/계정 서버 `user` 소유, `mesdb` = MES 서버 `csc-mes` 소유)
- **video-model 자체 DB**: FastAPI 서버(video-model)가 SQLAlchemy 2.0(async) + Alembic 으로 서버 내부에서 직접 관리한다.
- **file-upload 자체 DB**: FastAPI 서버(file-upload)가 SQLAlchemy 2.0(async) + Alembic 으로 업로드 에셋(`upload_assets`) 메타데이터를 서버 내부에서 직접 관리한다.

### NestJS 도메인 데이터 (groupwaredb / userdb / controltowerdb)

NestJS 서버군이 다루는 데이터는 `packages/database`의 Drizzle 스키마(groupwaredb/userdb/controltowerdb)로 정의된다. 예를 들어 그룹웨어 도메인에는 다음과 같은 데이터가 저장된다:

- **공지사항(notice)**: 사용자에게 전달되는 공지 데이터
- **사용자/조직 도메인 데이터**: 그룹웨어가 다루는 핵심 업무 데이터
- 컨트롤타워가 다루는 운영/관리 메타 데이터

이 데이터들은 서비스의 본질적인 기능을 구현하는 데 필요한 정보들이며, 각 NestJS 서버가 자기 영역의 테이블만 직접 접근한다.

### video-model 자체 데이터베이스 (영상 제작 자동화)

영상 제작 자동화 서버(video-model)는 **자체 데이터베이스**를 가지며, 이를 서버 내부에서 SQLAlchemy 2.0(async) + Alembic 으로 직접 관리한다. Drizzle 이 아닌 Python 토대의 마이그레이션/ORM 스택을 쓴다는 점이 NestJS 서버군과 다르다.

대표적으로 영상 작업(`video_jobs`) 데이터가 저장된다:

- **video_jobs**: 영상 제작 작업 단위 (`id`, `title`, `status`, `created_at`)
- 작업 상태(`VideoJobStatus`): `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`

영상 제작 자동화 데이터는 처리 패턴(비동기 작업, 상태 전이)이 그룹웨어/컨트롤타워의 일반 업무 데이터와 다르기 때문에, 별도 서버가 자체 DB로 소유하는 것이 자연스럽다.

### 분리의 이점

**1. 명확한 책임 분리**

각 서버는 "무엇을 서비스할 것인가"에 따라 자기 DB만 책임진다. 그룹웨어 도메인, 컨트롤타워 도메인, 영상 제작 자동화 도메인은 완전히 다른 관심사이기 때문에, DB를 분리(전용 DB + 전용 롤)하는 것이 오히려 자연스럽다 (여기서 "분리"는 논리적 소유권 경계를 뜻하며, 물리 패키징은 아래 "물리 패키징 정책" 참고: 호스트당 PG 1개 + 논리 DB 가 기본).

**2. 성능 격리**

한 서버가 무거운 집계/통계 쿼리를 실행하더라도, 다른 도메인 서버의 응답 속도에는 영향을 주지 않는다. 예를 들어, video-model가 대량의 영상 작업을 처리하는 동안에도 그룹웨어 API의 공지 조회 속도에는 영향이 없다.

**3. 보안 강화**

각 DB는 자기 게이트키퍼 서버에서만 접근 가능하도록 설정할 수 있다. 한 서버가 침해당하더라도, 다른 도메인의 데이터는 별도로 보호된다. 또한 각 데이터베이스에 대한 접근 권한을 명확하게 분리할 수 있어, 최소 권한 원칙을 적용하기 쉽다.

**4. 독립적인 확장**

영상 제작 자동화처럼 부하 특성이 다른 워크로드는 독립적으로 리소스를 늘릴 수 있다. 각자의 필요에 맞게 독립적으로 리소스를 할당할 수 있어, 비용 효율적이다.

**5. 데이터 보관 정책 분리**

도메인마다 보관 요구사항이 다를 수 있다. 데이터베이스가 분리되어 있으면, 각각에 다른 백업 전략과 보관 정책을 적용하기 쉽다.

### DB 소유권 경계 규칙 (반드시 지킬 것)

"DB 분리"의 본질은 **PG 인스턴스 개수가 아니라 논리적 소유권 경계**다. 아래 3개만 지키면
물리 패키징(인스턴스를 몇 개 두는지)과 무관하게 게이트키퍼 원칙이 성립한다.

1. **서비스마다 전용 DB**: 하나의 DB(논리 데이터베이스)를 두 서비스가 함께 쓰지 않는다.
2. **서비스마다 전용 DB 롤(계정) + 최소 권한**: 각 서비스는 자기 DB 롤로만 접속하고, 남의 DB 롤/스키마는 모른다.
3. **크로스 DB SQL/JOIN 금지**: 다른 도메인 데이터가 필요하면 SQL 이 아니라 **HTTP + 서비스 토큰**으로 그 DB 의 주인 백엔드를 호출한다.

> **이식성:** 위 경계를 지키면, 나중에 특정 DB 를 별도 컨테이너/별도 호스트로 떼어내는 작업이
> **연결 URL 한 줄 교체**(예: `USER_DATABASE_URL`)로 끝난다. 코드 변경 거의 없음. 반대로 한 번이라도
> 크로스 DB JOIN 을 허용하면 이후 분리가 매우 어려워진다.

### 물리 패키징 정책: 호스트당 PG 1개 + 논리 DB

현재 단일 호스트 Docker Compose 규모에서는 **"서비스마다 PG 컨테이너 1개"가 아니라
"호스트당 PG 인스턴스 1개 + 서비스별 논리 DB + 전용 롤"** 을 채택한다.

```
web-server : PG 1개 ─ userdb / groupwaredb / controltowerdb / marketingdb / mesdb / file_upload (각각 전용 롤)
video-ai-server  : PG 1개 ─ video-model 자체 DB
```

- 같은 호스트의 서비스들은 PG 하나를 공유하되 **논리 DB + 전용 롤로 경계**가 선다(소유권 규칙은 그대로 성립).
- "컨테이너마다 PG 1개"는 단일 호스트에선 **운영 부담만 N배**(백업/모니터링/패치/메모리)이고,
  같은 물리 머신이라 장애, 리소스 격리 이점은 반쪽이라 채택하지 않는다.

### 물리 분리 트리거 (그 DB만 별도 컨테이너/호스트로 승격)

다음 중 하나에 해당하면 **그 DB 한정**으로 물리 분리를 진행한다(처음부터 전부 쪼개지 않는다).

- 독립적인 스케일링 / 리소스 보장(SLA)이 필요
- 다른 PG 버전, 확장이 필요 (예: AI 용 `pgvector`)
- 백업/보존 정책이 크게 다름
- 강한 blast-radius 격리 / 컴플라이언스 요구

> **한 줄 원칙:** 경계는 처음부터 엄격하게, 물리 컨테이너 분리는 트리거를 충족할 때.

### redis 소유권 경계 규칙 (arq 작업 큐)

redis(arq 작업 큐)도 postgres 와 **동일한 소유권 원칙**을 따른다. 서비스가 redis 를 공유하면 그게 곧 "크로스 DB 공유"의 redis 판이다. 실제로 여러 arq 앱이 한 redis(db 0)를 공유해, 한 서비스의 잡을 다른 서비스 워커가 가로채 실패시킨 사고가 있었다(video-model 워커가 데이터랩 crawl 잡을 `function 'crawl_datalab_keywords' not found` 로 실패, 버킷 영구 미수집).

**규칙: arq 서비스마다 전용 redis 논리 DB.** postgres 가 전용 논리 DB 하나로 격리하듯 redis 도 db 하나로 격리한다. 별도 queue 네이밍 계층은 두지 않는다(db 가 전체 키스페이스를 이미 분리하므로 불필요).

```
db 0  예약/미사용 (canary: REDIS_URL 의 db 를 깜빡한 서비스가 떨어지는 곳, 비워둠)
db 1  data-collector  (논리 postgres DB 이름만 `crawler` 로 남아 있다: 데이터 보존 목적)
db 2  video-model   (web api enqueue + ai worker consume 둘 다 같은 db)
db 3  language-model (Phase 2 예약)
db 4  file-upload   (확정되지 않은 자산 수거 크론. 큐로 받는 잡이 없어 API 는 redis 에 붙지 않는다)
```

- **격리 = `REDIS_URL` 경로의 `/N`**(예: `redis://…@redis:6379/1`). enqueue 풀과 워커가 같은 `REDIS_URL` 을 읽으므로 **코드 변경 없이 env 만으로** 양쪽이 격리된다. queue/job/result/in-progress/health 키가 전부 db 로 분리되고 각 db 는 자기 `arq:queue` 를 따로 가지므로, 서비스 간 잡 도난과 job_id 충돌이 원천 차단된다.
- **enqueue(web api)와 consume(worker)는 반드시 같은 db.** 어긋나면 잡이 조용히 미소비되므로, config `redis_url` 기본값이 서비스 db 를 자기문서화하고 compose `REDIS_URL` 과 이 표가 SSOT 다. 배포 후 `redis-cli -n <N> keys 'arq:*'` 로 확인.
- **이식성:** 나중에 특정 서비스 redis 를 별도 인스턴스/호스트로 떼는 작업이 `REDIS_URL` 한 줄 교체로 끝난다(postgres `*_DATABASE_URL` 분리와 동형).
- **새 arq 서비스 추가 = 다음 db 번호 + 이 표 한 줄.** db 0 은 쓰지 않는다.

### Kafka 소유권 경계 (로그 스트림): redis 와 별개 계층

`log-server` 는 redis/arq 를 쓰지 **않는다.** arq 는 태스크 큐(잡 하나 = 처리 한 번, 결과 보관)이고
로그는 스트림(여러 소비자, 재생, 종류별 보존기간)이라 모델이 맞지 않는다. 따라서 위 redis 논리 DB
할당표는 log-server 와 무관하며, 새 arq 서비스가 생기면 다음 번호는 **db 5** 다.

Kafka 의 격리 축은 **토픽 네임스페이스 + 컨슈머그룹**이다(redis 의 논리 DB 에 대응).

```
csc.logs.{kind}                기본: 승격되지 않은 전체 (컨슈머그룹 log-sink.platform)
csc.{ai_tool}.logs.{kind}      승격된 AI 도구 전용 (컨슈머그룹 log-sink.{ai_tool})
```

- 토픽은 **kind(EVENT/ERROR/AUDIT/ACCESS)로만** 쪼갠다. 보존기간이 kind 별로 다르고 Kafka 는
  토픽 단위로 retention 을 주기 때문. 조직/AI도구는 카디널리티가 높아 메시지 키와 컬럼으로 간다.
- **AI 도구 승격 = 설정 변경**(`PROMOTED_AI_TOOLS` + 워커를 `LOG_SCOPE=<tool>` 로 한 벌 더 기동).
  코드 변경 없이 그 도구만 전용 토픽, 전용 컨슈머그룹, 전용 ClickHouse DB 를 갖는다.
- 컨슈머그룹이 scope 마다 갈리므로 승격 인스턴스가 남의 로그를 소비하는 사고(arq 잡 도난과 같은 유형)가
  구조적으로 차단된다.

### 수집 소유권 경계 규칙 (data-collector)

> **크롤링이든 API 든, 데이터 수집이 이루어지는 프로세스와 그에 관한 지식은 어떤 AI 도구에도 두지 않는다.**

DB 소유권과 같은 종류의 경계다. 다른 점은 이 경계가 **코드 호출뿐 아니라 정보로도** 깨진다는 것이다.
호출은 전부 `data-collector` 를 거치는데 벤더 분류 코드와 보관 정책과 자격증명 스키마는 AI 도구가
들고 있는 상태가 실제로 있었다. 그러면 어느 계층도 검증하지 않는 값이 화면에서 수집 요청까지 그대로
흘러가고, 수집기가 못 알아들으면 화면은 그것을 "수집 중"으로 읽어 영구 로딩이 된다.

| 무엇 | 주인 | 근거 |
|------|------|------|
| 어떤 소스가 있나 (카탈로그) | 수집기 | `GET /sources` |
| 무엇을 수집할 수 있나 (분야/기간 등 선택지) | 수집기 | `GET /sources/{id}/options` |
| 얼마나 보관하나 (`expected`) | 수집기 | 같은 응답. 진행률의 분모 |
| 어떻게 수집하나 (크롤/API/인증/차단 우회) | 수집기 | 밖으로 내보내지 않는다 |
| 자격증명 | 수집기 | 도구 DB 는 보관하지 않는다 |
| 지금 어떤 상태인가 (`status`) | 수집기 | 응답에 싣는다. 소비자가 역추론하지 않는다 |
| 이 조직/채널이 무엇을 원하는가 | AI 도구 | 단, 값은 수집기가 준 선택지 안에서만 고른다 |

집행 규칙 넷:

1. **소비자는 수집 선택지를 상수로 갖지 않는다.** 벤더 코드표(분류 cid 등)를 프론트나 도구 백엔드에
   복제하면 그 순간 검증되지 않는 값의 출처가 하나 더 생긴다.
2. **수집기는 못 알아듣는 타깃에 400 을 준다.** 빈 결과로 답하면 소비자가 "아직 수집 중"과 구분하지
   못한다(무한 폴링).
3. **상태는 응답 필드로 온다.** `items.length === 0` 같은 역추론은 금지. 미수집일 때도 `status` 와
   진행률 분모를 채워 보낸다. 그때가 정확히 그 값이 필요한 순간이다.
4. **수집 방식은 노출하지 않는다.** 사용자가 행동에 옮길 수 없는 정보이고, 표시하려면 도구가 수집
   구현을 알아야 한다.

새 소스 추가는 수집기 안에서 끝난다(소스 도메인 + 합성 루트 등록). 소비자 쪽 변경이 필요하면
경계가 새고 있다는 신호다.

---

## 백엔드 API 서버 구조

### 핵심 원칙: 각 Backend API = 자기 DB의 게이트키퍼

> **다른 DB 데이터 필요하면 → HTTP로 해당 Backend 호출 (+ 서비스 토큰)**

csc의 백엔드는 NestJS 2개 + FastAPI 1개로 구성된다.

### csc-groupware (NestJS)

csc-groupware는 csc 그룹웨어 API 서버다 (`apps/api/nestjs/csc-groupware/`). NestJS 기반이며, Drizzle ORM 으로 자기 DB(groupwaredb)를 직접 소유하는 **게이트키퍼**다.

**주요 책임:**
- 공지사항(notice), 조직/사용자 등 그룹웨어 핵심 도메인의 CRUD 작업
- 그룹웨어 비즈니스 로직 실행

**특별한 점:**

csc-groupware는 필요에 따라 다른 서버(csc-control-tower, video-model)를 HTTP + 서비스 토큰으로 호출할 수 있다. 이렇게 하면 csc-groupware는 타 도메인 데이터가 어떻게 저장되어 있는지 몰라도 되고, 단지 해당 서버가 제공하는 인터페이스만 사용하면 된다.

### csc-control-tower (NestJS)

csc-control-tower는 csc 컨트롤타워 API 서버다 (`apps/api/nestjs/csc-control-tower/`). NestJS 기반이며 Drizzle ORM 으로 자기 DB(controltowerdb)를 직접 소유하는 **게이트키퍼**다. 운영/관리 관점의 도메인을 전담한다.

**주요 책임:**
- 운영/관리 도메인 데이터의 CRUD 작업
- 컨트롤타워 비즈니스 로직 실행

**특별한 점:**

csc-control-tower도 다른 서버를 HTTP + 서비스 토큰으로 호출할 수 있다. 예를 들어, 그룹웨어 도메인의 데이터가 필요하면 "이것은 csc-groupware가 소유한 데이터이므로 csc-groupware에게 요청해야 한다"고 판단하고, csc-groupware를 호출한다.

### user (NestJS)

user는 인증/계정 API 서버다 (`apps/api/nestjs/user/`). csc 의 **인증 게이트키퍼**로, 앱, 웹, 관리자 등 **다중 유저 타입**(`APP_USER` / `WEB_USER` / `ADMIN_USER`)의 로그인, 회원가입, 토큰 발급/갱신을 담당하며 `userdb`를 직접 소유한다.

**주요 책임:**
- 이메일/소셜 로그인, 회원가입, JWT(Access/Refresh) 발급, 갱신 (`/auth/login/email`, `/auth/login/social`, `/auth/refresh`, `/auth/logout`)
- 유저 타입(audience)별 계정 관리: web/groupware 은 `WEB_USER`, web/control-tower 은 `ADMIN_USER`, 모바일/외부는 `APP_USER`
- 사용자 정보 조회 API 제공 (`/api/user/me` 등)

자세한 인증 플로우는 [auth-process-flow.md](./auth-process-flow.md) 참고.

### csc-mes (NestJS)

csc-mes는 MES(제조실행) API 서버다 (`apps/api/nestjs/csc-mes/`, 포트 3004). `mesdb`를 직접
소유하며, 작업지시와 생산실적(POP), 품질검사, 설비 가동상태를 담당한다.

**특별한 점 둘:**

**1. 클라이언트가 오프라인 우선 데스크톱 앱이다.** 현장 PC(`apps/desktop/mes`)는 로컬 SQLite 를
1차 저장소로 쓰고 outbox 에 쌓았다가 복구 시 밀어 넣는다. 그래서 이 서버의 API 는 다른 서버들과
성질이 다르다.

- **pull 은 델타**여야 한다(`GET /v1/sync/changes`). 매번 전량을 받으면 8시간 오프라인 뒤 복구가 불가능하다.
- **push 는 멱등**이어야 한다(`POST /v1/sync/operations`). 재시도가 기본 동작이라 응답을 못 받은 요청이 반드시 생긴다.
- **삭제는 tombstone**이어야 한다. 오프라인 클라이언트는 "없어진 행" 을 스스로 알 수 없다.
- 커서는 **조직별 단조증가 `server_seq`** 다. `updated_at` 은 clock skew 와 동시 커밋 tie 로,
  `bigserial` 은 할당 순서와 커밋 순서가 어긋나서 행을 **영구히** 건너뛴다.

**2. 모노레포에서 BFF 를 거치지 않는 최초의 서버다.** 데스크톱 앱에는 `SERVICE_TOKEN_SECRET` 을
심지 않으므로(전 백엔드 공유 시크릿이라 한 번 유출되면 모두 뚫린다) 유저 JWT + 디바이스 토큰이라는
별도 인증 경로를 갖는다. 상세는 [security-architecture.md](./security-architecture.md) 의
"서비스 토큰을 갖지 않는 클라이언트" 절.

프로토콜 전문: `docs/specs/mes-sync-protocol.md`

### video-model (FastAPI)

video-model는 영상 제작 자동화 API 서버다 (`apps/api/fastapi/video-model/`). Python/FastAPI 기반이며, **자체 데이터베이스의 유일한 게이트키퍼**다. 이 서버만이 자기 DB에 직접 접근할 권한을 가집니다.

**기술 스택:**
- 웹 프레임워크: FastAPI
- DB: SQLAlchemy 2.0 (async) + Alembic 마이그레이션
- 패키지/런타임: uv
- 설정: pydantic-settings
- DI: FastAPI `Depends`

**주요 책임:**
- 영상 제작 작업(`video_jobs`) 생성 및 상태 관리 (`PENDING` → `PROCESSING` → `COMPLETED`/`FAILED`)
- 마케팅 영상 제작 자동화 파이프라인 처리: **모든 FFmpeg/트랜스코딩(H.264/AAC 등) 영상 처리를 담당**
- 영상 작업 조회 API 제공 (`/video-jobs`)

**특별한 점:**

video-model는 NestJS 서버군과 다른 언어/스택(Python, SQLAlchemy+Alembic)을 사용하지만, "자기 DB만 직접 접근하고 타 도메인은 HTTP로 호출한다"는 게이트키퍼 원칙은 동일하게 적용된다. 다른 서버가 영상 작업 데이터를 필요로 하면 video-model를 HTTP + 서비스 토큰으로 호출한다.

### file-upload (FastAPI)

file-upload는 파일 업로드/오브젝트 스토리지 API 서버다 (`apps/api/fastapi/file-upload/`). Python/FastAPI 기반이며, 업로드 에셋 메타데이터(`upload_assets`)를 담는 **자체 DB의 유일한 게이트키퍼**다.

**기술 스택:** FastAPI, SQLAlchemy 2.0(async) + Alembic, uv, pydantic-settings, `Depends`

**주요 책임:**
- presigned URL 발급 및 업로드 확인 (`POST /uploads/presign`, `POST /uploads/{upload_id}/confirm`)
- 스토리지 백엔드를 `StoragePort` 뒤로 추상화: 1차는 **로컬/마운트 파일시스템**(`STORAGE_BACKEND=local`),
  오브젝트 스토리지(R2/S3)는 추후 어댑터로 교체 가능. 환경별 스토리지 구조는 [file-upload-limits.md](./file-upload-limits.md) 의 "스토리지 디렉터리 구조" 참고.
- 업로드 에셋 상태(`PENDING` → `UPLOADED`) 관리

**특별한 점:**

file-upload는 **FFmpeg/영상 처리를 하지 않는다.** 업로드된 영상의 트랜스코딩이 필요하면 video-model 를 HTTP + 서비스 토큰으로 호출한다(업로드와 영상 처리의 책임 분리).

### log-server (FastAPI)

log-server는 통합 로그 수집/조회 API 서버다 (`apps/api/fastapi/log-server/`). 전 백엔드가 보내는
로그를 받아 Kafka 로 버퍼링하고, 별도 컨슈머 프로세스가 ClickHouse 에 적재한다.

**기술 스택:** FastAPI, aiokafka, ClickHouse(clickhouse-connect), uv, pydantic-settings, `Depends`

**주요 책임:**
- 로그 배치 수집 (`POST /logs`) → Kafka 발행. 202 로 즉시 응답해 **프로듀서의 비즈니스 경로를 막지 않는다.**
- 컨슈머(`python -m app.worker`)가 Kafka → ClickHouse 배치 적재. 실패는 DLQ 로 보내고 오프셋을 커밋하지 않는다.
- 조회/집계 (`POST /logs/search`, `POST /logs/usage`): 조직 스코프 인가를 서비스 계층에서 강제.
- 3축 스코프(전체 서비스 / 조직 / AI 도구)로 분리: 상세는 위 "Kafka 소유권 경계" 절.

**특별한 점:**

**Postgres 를 소유하지 않는다.** 저장소는 ClickHouse 뿐이라 Alembic 대신 자체 SQL 마이그레이션 러너
(`clickhouse/migrate.py`, 체크섬 검증 + 멱등)를 컨테이너 command 에서 실행한다. 또한 **수신 전용**이라
다른 서버를 호출하지 않는다. 의존 방향이 다른 게이트키퍼들과 반대다.

---

## 백엔드 간 통신의 원칙

각 백엔드 API는 자기가 담당하는 데이터만 직접 접근한다. 다른 데이터가 필요하면, 해당 데이터를 관리하는 API를 **HTTP + 서비스 토큰**으로 호출해서 가져온다. 통신 경로는 csc-control-tower ↔ csc-groupware ↔ video-model 사이에서 양방향으로 일어날 수 있다.

> **서비스 토큰**: 서버 간 호출은 사용자 세션이 아니라 서버 신원을 증명하는 서비스 토큰으로 인증한다. 호출받는 서버는 토큰으로 호출 주체가 신뢰할 수 있는 내부 서버인지 검증한다.

### 예시 1: 컨트롤타워에서 그룹웨어 데이터를 수정하는 경우

```
1. 관리자가 admin 프론트엔드(web/control-tower)에서 "공지 ID 123의 제목 변경" 작업을 수행
2. web/control-tower BFF 서버가 이 요청을 받아 csc-control-tower API로 전달
3. csc-control-tower가 공지 데이터는 자기 소유가 아니라고 판단
4. csc-control-tower가 csc-groupware에게 서비스 토큰을 붙여 PUT /notices/123 요청을 전송
5. csc-groupware가 자신의 데이터베이스(groupwaredb)에서 공지 정보를 업데이트
6. csc-groupware가 성공을 응답
7. csc-control-tower가 web/control-tower BFF 서버에게 완료를 응답
```

### 예시 2: 그룹웨어 화면이 영상 작업 상태를 함께 보여줄 때

```
1. 사용자가 main 프론트엔드(web/groupware) 화면에 접속
2. web/groupware BFF 서버가 csc-groupware API에게 "화면 데이터를 주세요"라고 요청
3. csc-groupware는:
   - 자신의 데이터베이스(groupwaredb)에서 공지 목록을 조회
   - video-model에게 서비스 토큰을 붙여 GET /video-jobs 요청을 보내 영상 작업 상태를 가져옴
4. csc-groupware가 두 데이터를 조합해서 web/groupware BFF 서버에게 응답
5. web/groupware BFF 서버가 이를 렌더링해서 사용자에게 표시
```

---

## 프론트엔드 서버의 역할

많은 프로젝트에서는 브라우저가 직접 백엔드 API를 호출한다. 하지만 csc는 브라우저와 백엔드 API 사이에 프론트엔드 서버를 둡니다. 이를 **SSR (Server-Side Rendering)** 또는 **BFF (Backend for Frontend)** 패턴이라고 부릅니다. 프론트엔드는 SvelteKit(페이지 중심 구조: UI 는 `lib/pages/`, 클라이언트 상태는 `lib/shared/lib/stores/`, 데이터는 `lib/features/<feature>/` 의 `apis→queries/mutations→services`)으로 구현되며, `apps/web/`에 `groupware`, `control-tower` 두 앱이 있다.

### web/groupware (사용자용 BFF)

web/groupware 서버는 일반 사용자를 위한 BFF 서버다. 이 서버는 주로 **csc-groupware API**와 대화한다.

**왜 이렇게 설계했는가?**

브라우저가 직접 여러 백엔드 API를 호출하게 되면, 복잡도가 증가한다. "이 데이터는 어느 API에서 가져와야 하지?", "API 주소가 바뀌면 어떻게 하지?", "토큰은 어떻게 관리하지?" 같은 고민들이 프론트엔드 코드에 녹아들게 된다.

대신, 프론트엔드 서버를 두면 브라우저는 단 하나의 엔드포인트만 알면 된다. 브라우저 입장에서는 "나는 자기 web 서버에 요청하면 화면 데이터가 온다"는 것만 알면 되고, 그 데이터가 실제로 어디서 왔는지는 몰라도 된다.

**보안의 이점:**

브라우저에서는 API 키나 민감한 토큰이 노출될 위험이 있다. 하지만 프론트엔드 서버를 두면, 모든 인증 정보(서비스 토큰 포함)는 서버에만 존재하고, 브라우저에는 세션 쿠키만 있으면 된다. 또한 CORS (Cross-Origin Resource Sharing) 문제도 자연스럽게 해결된다.

**캐싱의 이점:**

프론트엔드 서버는 자주 요청되는 데이터를 캐싱할 수 있다. 예를 들어, 자주 바뀌지 않는 데이터는 일정 주기로만 백엔드 API에서 가져오고, 나머지는 캐시된 데이터를 사용하면, 불필요한 API 호출을 줄일 수 있다.

### web/control-tower (관리자용 BFF)

web/control-tower 서버는 관리자를 위한 BFF 서버다. 이 서버는 주로 **csc-control-tower API**와 대화한다.

관리자도 마찬가지로, 브라우저는 하나의 엔드포인트만 알면 된다. "공지를 수정하고 싶다" → 자기 web 서버에 요청. 이 요청이 실제로는 csc-control-tower를 거쳐 csc-groupware까지 가는 복잡한 흐름이지만, 브라우저는 그저 자기 web 서버만 호출하면 된다.

**독립적인 배포:**

web/groupware과 web/control-tower이 분리되어 있으면, 관리자 페이지에 새 기능을 추가하거나 버그를 수정할 때, 일반 사용자 서비스에 전혀 영향을 주지 않고 배포할 수 있다. 반대도 마찬가지다.

---

## 데이터 흐름의 원칙

시스템 전체를 관통하는 하나의 명확한 원칙이 있다:

> **"각 레이어는 바로 아래 레이어만 호출한다"**

- **브라우저** → 자신의 web 서버만 호출
- **web 서버(BFF)** → 백엔드 API 호출 (서버 측에서 서비스 토큰 부착)
- **백엔드 API** → 자신의 데이터베이스에 직접 접근, 필요시 다른 백엔드 API를 HTTP + 서비스 토큰으로 호출

### 절대로 일어나지 않는 일

- 브라우저가 다른 도메인의 API를 직접 호출 (불가능, CORS로 차단됨)
- web/control-tower BFF 서버가 csc-groupware를 곧바로 우회 호출 (관리자 흐름은 csc-control-tower를 경유)
- csc-groupware가 csc-control-tower의 DB(controltowerdb)를 직접 접근 (권한 없음)
- csc-control-tower가 csc-groupware의 DB(groupwaredb)를 직접 접근 (권한 없음)
- 다른 서버가 video-model의 자체 DB를 직접 접근 (video-model를 HTTP로 호출해야 함)

이 원칙을 지키면, 시스템의 각 부분이 명확한 책임을 가지게 되고, 변경의 영향 범위를 예측하기 쉬워집니다.

---

## 시스템 구성 요약

구성: **NestJS 3개(csc-groupware, csc-control-tower, user) + FastAPI 2개(video-model, file-upload) + SvelteKit 2개(web/groupware, web/control-tower) + 공유 packages**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        사용자 브라우저                                │
│                   (groupware Web App)                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   web/groupware (SvelteKit BFF)                           │
│              csc-groupware API 호출 (서비스 토큰)                     │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│             csc-groupware (NestJS)           │
│        groupwaredb 게이트키퍼 (Drizzle ORM)        │
│   필요시 csc-control-tower / video-model 호출    │
└──────┬──────────────────────┬────────────────┘
       │                      │ HTTP + 서비스 토큰
       ▼                      ▼
┌────────────────┐  ┌───────────────────────────┐
│  groupwaredb        │  │  csc-control-tower (NestJS)│
│ (PostgreSQL)   │  │   controltowerdb 게이트키퍼       │
│                │  │   (Drizzle ORM)           │
│ - notice       │  │   필요시 csc-groupware /   │
│ - 조직/사용자  │  │   video-model 호출            │
└────────────────┘  └───┬───────────┬───────────┘
                        │           ▲
                        ▼           │ HTTP + 서비스 토큰
                  ┌──────────┐      │
                  │ controltowerdb  │      │
                  │(Postgres)│      │
                  └──────────┘      │
                                    │
        ┌──────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│            web/control-tower (SvelteKit BFF)          │
│       csc-control-tower API 호출 (토큰)        │
└──────────┬────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│       관리자 브라우저         │
│  (control-tower Web App)     │
└──────────────────────────────┘

         ── 영상 제작 자동화 도메인 ──

┌──────────────────────────────────────────────┐
│              video-model (FastAPI)               │
│   SQLAlchemy 2.0(async) + Alembic + uv        │
│        자체 DB 유일한 게이트키퍼               │
│                                               │
│  호출자: csc-groupware, csc-control-tower      │
│          (HTTP + 서비스 토큰)                  │
└───────────────────┬───────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   video-model 자체 DB    │
        │    (PostgreSQL)       │
        │                       │
        │  - video_jobs         │
        │    (id/title/status/  │
        │     created_at)       │
        └───────────────────────┘

         ── 파일 업로드 도메인 ──

┌──────────────────────────────────────────────┐
│              file-upload (FastAPI)          │
│   SQLAlchemy 2.0(async) + Alembic + uv         │
│   presigned URL 발급/확인, FFmpeg 없음        │
│   영상 처리는 video-model 로 위임        │
└───────────────────┬───────────────────────────┘
                    ▼
        ┌───────────────────────┐
        │  file-upload 자체 DB │
        │    (PostgreSQL)        │
        │  - upload_assets       │
        └───────────────────────┘

         ── 인증 도메인 ──

┌──────────────────────────────────────────────┐
│                  user (NestJS)                 │
│   인증/계정 게이트키퍼, userdb (Drizzle)       │
│   APP_USER / WEB_USER / ADMIN_USER 토큰 발급    │
│   호출자: web/groupware, web/control-tower BFF (로그인/갱신)  │
└────────────────────────────────────────────────┘
```

---

## 프로덕션 인프라 구성

### 전체 구성도

```
사용자 브라우저
      │
      ▼
┌─────────────────────────────────────────┐
│            Cloudflare                    │
│  ├ DNS (프록시 모드, 오렌지 구름)         │
│  ├ CDN (정적 자산 캐싱)                  │
│  └ SSL (Full Strict)                     │
│  (파일 저장소 아님: 업로드물은 서버 로컬 FS) │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         서버 (Ubuntu, Docker Compose)    │
│                                          │
│  ├ nginx                (리버스 프록시)  │
│  ├ web-groupware             (SvelteKit)      │
│  ├ web-control-tower            (SvelteKit)      │
│  ├ csc-groupware        (NestJS)         │
│  ├ csc-control-tower    (NestJS)         │
│  ├ user                 (NestJS, 인증)   │
│  ├ video-model      (FastAPI)        │
│  └ file-upload  (FastAPI, 업로드/스토리지)│
│     └ 업로드물 → 호스트 ~/Storage/{env}  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         PostgreSQL                       │
│                                          │
│  ├ groupwaredb   (csc-groupware: 공지/조직)   │
│  ├ userdb   (사용자/인증)                │
│  ├ controltowerdb  (csc-control-tower: 운영)    │
│  ├ file_upload (file-upload: 업로드 에셋 메타)  │
│  └ video-model 자체 DB (영상 작업)          │
│                                          │
│  * NestJS DB(groupwaredb/userdb/controltowerdb)는    │
│    packages/database(Drizzle)가 스키마   │
│    관리                                  │
│  * video-model 자체 DB는 SQLAlchemy +       │
│    Alembic 으로 서버 내부 관리           │
└─────────────────────────────────────────┘
```

### 설계 결정 사유

| 결정 | 사유 |
|------|------|
| **Cloudflare CDN + DNS** | 자동 HTTPS, DDoS 방어, 글로벌 캐싱 |
| **Docker Compose 단일 호스트** | 초기 트래픽 규모에 적합, 단순 관리 |
| **NestJS 2개 + FastAPI 1개 분리** | 그룹웨어/컨트롤타워/영상 자동화 도메인의 책임 분리, 영상 처리(FFmpeg 등)는 Python 스택이 유리 |
| **DB 분리 (groupwaredb/userdb/controltowerdb + video-model 자체 DB)** | 도메인별 게이트키퍼 원칙, 접근 권한 격리 |
| **video-model 자체 DB (SQLAlchemy+Alembic)** | 영상 자동화 서버가 자기 DB를 서버 내부에서 직접 관리 (Python 마이그레이션 스택) |
| **로컬 FS 스토리지(file-upload)** | 1차 = 서버 로컬/마운트 FS(`~/Storage/{env}`), `StoragePort` 로 추상화해 추후 NAS/오브젝트(R2/S3) 교체 가능. nginx `/blob`, `/files` 로 브라우저 직접 PUT/GET(공인 IP 제한) |
| **Nginx 리버스 프록시** | 도메인/경로 기반 라우팅, Cloudflare ↔ 호스트 단일 진입점 |

### Cloudflare 설정 요점

- **DNS**: 프록시 모드 활성화 (오렌지 구름): 오리진 IP 노출 방지
- **SSL**: Full (Strict): 오리진에도 인증서 설치 필요 (Let's Encrypt 또는 Cloudflare Origin Certificate)
- **캐싱**: 정적 자산(이미지, JS, CSS) 자동 캐싱, API 경로는 bypass
- **업로드/다운로드**: 오브젝트 스토리지(R2)가 아니라 file-upload 가 nginx `/blob`(PUT), `/files`(GET)로
  서빙(공인 IP 제한). 브라우저 직접 PUT 은 file-upload `ALLOWED_ORIGINS`(CORS)로 cross-origin 허용(admin 포함).

### 환경별 배포 흐름

```
로컬 (dev 브랜치)
  ↓ PR
staging (동일 구성, 소규모)
  ↓ PR
prod (Docker Compose)
```

---

## 참고 문서

- [api-architecture.md](./api-architecture.md) - 코드 레벨 헥사고날 아키텍처 (Port & Adapter 패턴)
- [clean-architecture-structure.md](./clean-architecture-structure.md) - 클린 아키텍처 폴더 구조
- [request-flow.md](./request-flow.md) - UI → DB 요청 흐름 상세
- [hexagonal-architecture-intro.md](./hexagonal-architecture-intro.md) - 헥사고날 아키텍처 입문
- [database-migration-workflow.md](./database-migration-workflow.md) - DB 마이그레이션 워크플로우
