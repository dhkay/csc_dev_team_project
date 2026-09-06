# Database Migration Workflow

## 개요

csc_project 의 DB 마이그레이션은 **두 가지 갈래**로 운영된다. DB 소유권
원칙상 **한 DB 는 한 서버만 직접 소유**하며, 누가 소유하느냐에 따라 도구가
갈린다.

| 갈래 | 소유 서버 | 스키마 위치 | 마이그레이션 위치 | 적용 도구 |
|------|----------|------------|------------------|-----------|
| **NestJS / Drizzle** | `csc-groupware`, `csc-control-tower`, `user`, `csc-marketing`, `csc-mes` (NestJS) | `packages/database/src/<db>/schema/` | `packages/database/src/<db>/migrations/` | `drizzle-kit migrate` (hash 추적, 1회 적용) |
| **FastAPI / Alembic** | `video-model` (FastAPI, SQLAlchemy 2.0 async) | `apps/api/fastapi/video-model/app/domains/<d>/adapters/outbound/db/models.py` | `apps/api/fastapi/video-model/alembic/versions/` | `uv run alembic upgrade head` (version 추적) |

> **핵심 1: Drizzle 갈래:** NestJS 서버가 소유하는 DB(groupwaredb / userdb /
> controltowerdb / marketingdb / mesdb)는 **공유 패키지** `@csc/database`(`packages/database`)에서
> Drizzle + drizzle-kit 으로 일괄 관리된다. 여러 NestJS 서버가 같은 스키마를
> import 하기 때문에 패키지로 공유한다.
>
> **핵심 2: Alembic 갈래:** `video-model` 는 **자체 DB 를 서버 내부에서 독립
> 관리**한다. SQLAlchemy 모델(`models.py`)을 단일 진실원으로 삼아 Alembic 이
> autogenerate 한다. `packages/database` 에 두지 **않는다**: video-model 의 DB
> 는 video-model 만 소유하기 때문.

### DB 가 없는 서비스 (마이그레이션 무관)

`apps/web/` 의 프론트엔드(groupware, control-tower)와 `packages/` 의 라이브러리
(`shared-ui`, `net-utils`)는 Postgres 를 직접 소유하지
않으므로 이 문서의 마이그레이션 흐름과 무관하다.

---

## NestJS / Drizzle: `@csc/database`

> **참고:** 유저 정체성 테이블은 userdb로 분리되어 있다. 2계층: `admin_users`(관리자유저), `organization_users`(조직유저), `organizations`. 엔타이틀먼트(`features`/`ai_tools` 카탈로그 + `organization_features`/`organization_ai_tools` + `organization_user_features`/`organization_user_ai_tools`)도 userdb 다. groupwaredb는 현재 그룹웨어 도메인 테이블 자리(엔타이틀먼트는 userdb 로 이전됨).

### 구조

```
packages/database/src/groupwaredb/
├── schema/
│   ├── enums.ts            # pgEnum 정의 (Korean enum values)
│   ├── notice-tables.ts    # 공지 관련 테이블 (notice 등)
│   ├── other-tables.ts     # 기타 테이블 (report, language 등)
│   ├── relations.ts        # Drizzle relations 정의
│   └── index.ts            # barrel export
├── drizzle-client.ts       # Drizzle 싱글톤 클라이언트 (groupwareDb, groupwareSql)
├── drizzle.config.ts       # Drizzle Kit 설정
└── index.ts                # 패키지 export
```

userdb / controltowerdb 도 같은 레이아웃을 따른다 (`packages/database/src/userdb/`,
`packages/database/src/controltowerdb/`).

### 스키마 변경 워크플로우

마이그레이션은 두 유형으로 나뉜다. 어느 쪽인지 먼저 판단할 것.

#### 유형 1: Schema-only (자동 생성 그대로)

컬럼/테이블/인덱스/enum 추가, 삭제 등 **데이터 변환이 필요 없는** 변경.
`drizzle-kit generate` 출력을 손대지 않고 그대로 commit 한다.

```bash
# 1. 스키마 TS 수정 (예: notice 테이블에 컬럼 추가)
vi packages/database/src/groupwaredb/schema/notice-tables.ts

# 2. SQL + snapshot 자동 생성
npm run drizzle:generate:groupware

# 3. dev 적용 + database 패키지 빌드
npm run drizzle:migrate:groupware
npm run build --workspace @csc/database
```

#### 유형 2: Data-transforming (데이터 변환 포함)

컬럼 타입 변경 + 기존 값 보존, boolean→enum 매핑, 컬럼 분리/병합 등
**SQL 에 UPDATE/INSERT 가 필요한** 변경. 자동 생성 SQL 은 데이터를 잃거나
의도한 매핑을 못 만들기 때문에 `--custom` 으로 빈 템플릿을 만들고 직접
작성한다.

```bash
# 1. 스키마 TS 수정 (목표 상태)
vi packages/database/src/groupwaredb/schema/*.ts

# 2. 빈 SQL 템플릿 + 동기화된 snapshot 생성
cd packages/database
npx drizzle-kit generate --config=src/groupwaredb/drizzle.config.ts \
  --custom --name=<짧은_의도_이름>

# 3. 생성된 0NNN_<name>.sql 을 다단계 SQL 로 작성
#    (예: ADD COLUMN nullable → UPDATE 매핑 → SET DEFAULT/NOT NULL → DROP 구컬럼)

# 4. dev 적용 + 빌드
npm run drizzle:migrate:groupware
npm run build --workspace @csc/database
```

> **유형 2 작성 시 hash 변경 주의:** SQL 본문을 한 번 commit 한 뒤 다시
> 수정하면 hash 가 바뀐다. 이미 적용된 환경(`__drizzle_migrations` 에 row
> 있음) 이 있다면 다음 `migrate` 에서 hash mismatch 에러. 가급적
> staging 적용 전에 SQL 을 확정할 것.

### 주요 명령어 (DB 별로 `:groupware` / `:user` / `:controltower` 접미)

| 명령어 | 용도 |
|--------|------|
| `npm run drizzle:generate:groupware` | SQL + snapshot 자동 생성 (schema-only) |
| `drizzle-kit generate ... --custom --name=X` | 빈 SQL 템플릿 + snapshot 생성 (data-transforming) |
| `npm run drizzle:migrate:groupware` | journal 순서대로 미적용 SQL 실행 |
| `npm run drizzle:studio:groupware` | Drizzle Studio (DB 브라우저) |
| `npm run drizzle:push:groupware` | 스키마 → DB 직접 반영 (dev 빠른 실험만, 정규 경로 아님) |

### 컬럼 네이밍 규칙: Mixed Naming

> **주의:** groupwaredb / userdb 는 이전 ORM(Prisma/TypeORM) 시절 생성되어 DB
> 컬럼명이 **혼재**한다. controltowerdb 는 snake_case 로 통일되어 있다.

- `casing` 옵션 **미사용**: 모든 컬럼에 명시적 DB 이름 지정
- camelCase 컬럼: `userId: integer('userId')`, `adminStatus: varchar('adminStatus')`
- snake_case 컬럼: `createdAt: timestamp('created_at')`, `profileImage: text('profile_image')`

```typescript
// 예시: notice 테이블 (groupwaredb): 혼재된 컬럼 네이밍
export const notice = pgTable('notice', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }),
  authorId: integer('authorId'),                     // DB: camelCase
  thumbnail: text('thumbnail_image'),                // DB: snake_case
  createdAt: timestamp('created_at', { withTimezone: true }),  // DB: snake_case
});
```

### Enum 값: 한글 그대로 사용

```typescript
// DB에 한글이 직접 저장됨 → Drizzle에서도 한글 값 사용
export const usersTypeEnum = pgEnum('users_type_enum', [
  '활동회원', '정지회원', '영구정지회원', '휴면회원', '탈퇴회원',
]);
```

### Import 방법

```typescript
// Drizzle 클라이언트 및 스키마
import { groupwareDb, groupwareSql, notice, ... } from '@csc/database/groupwaredb';
import { userDb, userSql, organizationUsers, adminUsers, organizations, features, aiTools, organizationFeatures, organizationAiTools, ... } from '@csc/database/userdb';
import { controlTowerDb, controlTowerSql, ... } from '@csc/database/controltowerdb';

// Drizzle 연산자
import { eq, and, gte, lte, ilike, asc, desc, count, inArray, like, sql } from 'drizzle-orm';
```

### AdminDB: snake_case 통일

controltowerdb 는 다른 두 DB 와 달리 컬럼명이 snake_case 로 통일되어 있다.

- TypeScript: `camelCase` (예: `createdAt`, `finishDate`, `titleI18n`)
- DB 실제 컬럼: `snake_case` (예: `created_at`, `finish_date`, `title_i18n`)
- `casing` 옵션 **미사용**: 모든 컬럼에 명시적 DB 이름 지정

```typescript
// camelCase 속성 ↔ snake_case 컬럼을 명시적으로 매핑
export const someAdminTable = pgTable('some_admin_table', {
  id: serial('id').primaryKey(),
  finishDate: varchar('finish_date', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

---

## FastAPI / video-model: SQLAlchemy + Alembic (자체 관리)

> **중요:** video-model 의 DB 는 `packages/database` 와 **무관하다**. 스키마, 
> 마이그레이션, 런타임 모두 video-model 서버(`apps/api/fastapi/video-model/`)가 자체적으로
> 관리한다. drizzle-kit 명령에도, `@csc/database` 에도 포함되지 않는다.
> 단일 진실원은 SQLAlchemy 모델(`models.py`)이며, Alembic 이 그 모델을
> autogenerate 한다.

### 디렉토리 구조

```
apps/api/fastapi/video-model/
├── alembic.ini                         # Alembic 설정 (script_location, sqlalchemy.url 등)
├── alembic/
│   ├── env.py                          # target_metadata = Base.metadata 등록
│   └── versions/                       # 마이그레이션 리비전 파일 (autogenerate 산출물)
│       └── <revision>_<slug>.py
├── app/
│   └── domains/
│       └── <domain>/                   # 헥사고날 도메인 (예: video)
│           └── adapters/outbound/db/
│               └── models.py           # DeclarativeBase + Mapped[...] 모델 정의
├── pyproject.toml                      # uv 의존성
└── tests/
```

### autogenerate 가 동작하는 원리

`alembic/env.py` 가 각 도메인의 `Base.metadata` 를 `target_metadata` 에
등록한다. Alembic 은 이 metadata(= 모델 정의)와 실제 DB 스키마를 비교해
diff 를 SQL 로 뽑는다.

```python
# apps/api/fastapi/video-model/alembic/env.py (요지)
from app.domains.video.adapters.outbound.db.models import Base
# autogenerate 대상: 도메인별 Base.metadata 를 여기서 합친다.
target_metadata = Base.metadata
```

새 도메인의 모델을 추가하면 **반드시 그 도메인의 Base 를 `env.py` 에
import** 해야 autogenerate 가 인식한다 (import 누락 시 해당 테이블이 diff 에
잡히지 않음).

### 모델 정의 (단일 진실원)

```python
# app/domains/video/adapters/outbound/db/models.py
from datetime import datetime
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class VideoJobModel(Base):
    __tablename__ = "video_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

### 스키마 변경 워크플로우

```bash
cd apps/api/fastapi/video-model

# 1. 모델 수정 (목표 상태): 단일 진실원
vi app/domains/video/adapters/outbound/db/models.py

# 2. 리비전 자동 생성 (모델 ↔ DB diff)
uv run alembic revision --autogenerate -m "add status to video_jobs"

# 3. 생성된 alembic/versions/<revision>_*.py 검토 (autogenerate 는 완벽하지 않다)
#    - 데이터 변환(서버 default, 값 매핑)이 필요하면 upgrade()/downgrade() 직접 보강
vi alembic/versions/<revision>_add_status_to_video_jobs.py

# 4. 적용 (최신 head 까지)
uv run alembic upgrade head
```

### 주요 명령어

| 명령어 | 용도 |
|--------|------|
| `uv run alembic revision --autogenerate -m "..."` | 모델 ↔ DB diff 로 리비전 자동 생성 |
| `uv run alembic revision -m "..."` | 빈 리비전 생성 (데이터 전용 마이그레이션 직접 작성) |
| `uv run alembic upgrade head` | 미적용 리비전 모두 적용 |
| `uv run alembic downgrade -1` | 한 단계 롤백 (Drizzle 과 달리 down 지원) |
| `uv run alembic current` | 현재 적용된 리비전 확인 |
| `uv run alembic history` | 리비전 그래프 확인 |

### Drizzle 갈래와의 핵심 차이

| 항목 | NestJS (Drizzle) | video-model (Alembic) |
|------|------------------|--------------------|
| 단일 진실원 | 스키마 TS (`schema/*.ts`) | SQLAlchemy 모델 (`models.py`) |
| 마이그레이션 위치 | `packages/database/src/<db>/drizzle/` | `apps/api/fastapi/video-model/alembic/versions/` |
| 적용 도구 | `drizzle-kit migrate` | `uv run alembic upgrade head` |
| 적용 추적 | `__drizzle_migrations` (hash) | `alembic_version` (revision id) |
| down migration | **미지원** (roll-forward) | **지원** (`alembic downgrade -1`) |
| 관리 주체 | 공유 패키지 `@csc/database` | video-model 서버 자체 |

### 컬럼 네이밍 규칙

- 모델 속성: `snake_case` (Python 관례): `created_at`, `status_code`
- `Mapped[...]` 타입으로 컬럼 타입을 표현, `mapped_column(...)` 으로 제약 지정

---

## CI/CD 마이그레이션 흐름

### 실행 위치

마이그레이션은 **Docker 이미지 빌드 시점이 아니라 배포 스크립트 실행
시점**에 적용된다. Drizzle 갈래는 base 이미지에 `drizzle-kit` 만 들어있고
schema/SQL 은 호스트 저장소를 컨테이너에 volume mount 한다. Alembic 갈래는
video-model 이미지 안에서 `uv run alembic upgrade head` 를 실행한다.

| 환경 | 트리거 | 실행 명령 |
|------|--------|-----------|
| **dev** | 개발자 수동 | Drizzle: `npm run drizzle:migrate:<db>`, video-model: `uv run alembic upgrade head` |
| **staging** | `main`/`staging` push → CI | Drizzle: `drizzle-kit migrate` (hash 추적), video-model: `alembic upgrade head` (revision 추적) |
| **prod** | `main` push → self-hosted 러너 → `docker compose` | (위와 동일) |

배포 시 Drizzle 갈래 핵심 흐름:

```bash
docker run --rm \
  --env-file "$ENV_DIR/<api>.env" \
  -v "$REPO_ROOT/packages/database/src:/nestjs/packages/database/src" \
  -w /nestjs/packages/database \
  csc-base:prod \
  npx drizzle-kit migrate --config=src/<db>/drizzle.config.ts
```

video-model 갈래는 컨테이너 엔트리/배포 단계에서:

```bash
docker run --rm --env-file "$ENV_DIR/video-model.env" \
  video-model:prod \
  uv run alembic upgrade head
```

순서: NestJS DB (`groupwaredb → userdb → controltowerdb`) → video-model(`alembic upgrade
head`). 하나라도 실패하면 `exit 1` → 후속 서비스 빌드/재시작이 진행되지 않아
schema 와 코드 사이 mismatch 가 운영에 나가는 사고를 차단한다.

### 어떻게 적용 여부를 추적하나

- **Drizzle:** `drizzle-kit migrate` 가 각 DB 의 `drizzle.__drizzle_migrations`
  테이블에 적용된 마이그레이션의 `tag` 와 SQL 본문 `hash` 를 기록한다.
  - 같은 tag 가 이미 기록 있으면 → **skip** (재실행 안전)
  - 같은 tag 가 기록 있고 hash 가 다르면 → **에러**, 적용된 SQL 파일 사후
    수정 탐지
- **Alembic:** `alembic_version` 테이블에 현재 head revision id 한 줄을
  기록한다. `upgrade head` 는 그 지점부터 미적용 리비전만 순서대로 실행한다.

## 실패 대응 (Runbook)

### A. 배포 중 마이그레이션 에러로 abort

**증상:** deploy 스크립트가 migration failed 출력 후 종료. 이전 컨테이너는
그대로 살아있음 (서비스 무중단).

- **Drizzle:** `drizzle-kit migrate` 는 마이그레이션 파일 전체를 한 트랜잭션
  으로 감싸므로 일반적인 DDL/DML 실패는 **자동 ROLLBACK** 된다.
  (`CREATE INDEX CONCURRENTLY` 같은 트랜잭션 외부 명령은 예외: 별도
  마이그레이션 파일로 분리할 것.) `__drizzle_migrations` 에 실패 row 가 남지
  않으므로 재실행 시 깨끗하게 다시 시도된다.
- **Alembic:** PostgreSQL 은 DDL 트랜잭션을 지원하므로 리비전 실행이 실패하면
  `alembic_version` 갱신 전에 ROLLBACK 된다. 리비전 파일 또는 모델을 수정 후
  재배포하면 같은 head 부터 다시 시도된다.

**대응:**

1. 컨테이너 로그에서 어떤 statement / 리비전이 실패했는지 확인.
2. SQL/모델/리비전을 수정 → 재배포.
3. 트랜잭션 외 명령이 섞여 부분 적용된 예외 케이스라면 psql 로 직접 정리 후
   재배포.

### B. Drizzle Hash mismatch: "applied SQL 본문이 바뀌었음" 에러

**원인:** 누군가 이미 prod 에 적용된 `0NNN_*.sql` 을 사후 편집했고, 그 변경이
배포 환경에 도달.

**대응:**

1. **수정한 사람을 찾아 원본을 되돌린다.** 적용 완료된 SQL 은 절대 사후
   수정하지 않는다. 변경이 필요하면 새 idx 마이그레이션 추가.
2. 환경별 `__drizzle_migrations.hash` 와 현재 SQL 파일의 hash 가 어떤 조합으로
   어긋났는지 점검 (dev/staging/prod 모두 점검).
3. 정합성 회복 후 재배포.

> Alembic 에는 hash 검증이 없지만, 같은 원칙이 적용된다. 이미 적용된 리비전
> 파일은 사후 수정하지 말고 새 리비전을 추가한다.

### C. 마이그레이션은 성공했지만 새 코드가 prod 에서 실패

- **Drizzle:** down migration 을 **지원하지 않는다.** Roll-forward 가 원칙.
- **Alembic:** `alembic downgrade -1` 로 한 단계 롤백이 가능하지만, prod 에서는
  데이터 손실 위험 때문에 Drizzle 과 동일하게 roll-forward 를 우선한다.

1. 이전 코드 버전을 즉시 deploy 해서 트래픽 회복 (DB 는 이미 신규 schema 라
   기존 코드와 호환 가능해야 함. additive 변경 원칙이 중요한 이유).
2. 호환되지 않는 변경 (예: 컬럼 DROP 후 이전 코드가 그 컬럼 SELECT) 인 경우:
   - 핫픽스 마이그레이션을 새 idx/리비전으로 추가해 보정
   - 또는 prod DB 백업에서 PITR 복원
3. 향후 같은 사고 방지: **2-phase deploy** 패턴
   - 1차 배포: 새 컬럼/enum 추가 (additive). 코드는 양쪽 호환.
   - 2차 배포: 코드가 새 컬럼만 사용. 이전 컬럼 unused.
   - 3차 배포: unused 컬럼 DROP.

### D. dev DB 가 schema 와 어긋남

```bash
# Drizzle
npm run drizzle:migrate:groupware   # journal 의 미적용 SQL 적용 (정식 경로)
npm run drizzle:push:groupware      # schema TS → DB 직접 반영 (빠른 실험만)

# Alembic
cd apps/api/fastapi/video-model && uv run alembic upgrade head
```

`drizzle:push` 는 `__drizzle_migrations` 를 채우지 않으므로, 이후 같은 변경의
정규 마이그레이션이 들어오면 hash 충돌(B 항목) 또는 이미 존재하는 객체 재생성
시도(예: "type already exists") 가 발생할 수 있다. 같은 dev DB 에서 `push` 와
`migrate` 를 섞어 쓰지 말 것. 한 환경에서는 한 가지 경로만 사용한다.

이미 섞어 써서 충돌이 난 dev DB 는 다음 중 하나로 정리:

- **DB 초기화** + `migrate` 처음부터 (가장 깨끗함)
- 또는 충돌 객체를 psql 로 수동 DROP 한 뒤 `migrate` 재실행
- 또는 `__drizzle_migrations` 에 해당 마이그레이션 row 를 수동 INSERT
  (hash 는 SQL 파일 내용의 SHA256)

video-model 쪽이 어긋나면 `alembic current` 로 현재 리비전을 확인하고
`alembic upgrade head` (또는 필요 시 `alembic stamp <revision>` 으로 추적
지점 보정) 한다.

### E. Drizzle snapshot 과 schema 사이 drift (generate 가 거대한 거짓 diff 생성)

**원인:** 누군가 `generate` / `generate --custom` 을 우회해 SQL 을 직접
추가하면서 snapshot 을 업데이트하지 않으면, 다음 `generate` 가 stale snapshot
기준으로 누적 diff 를 만든다.

**예방:** 모든 마이그레이션은 `drizzle-kit generate` (schema-only) 또는
`drizzle-kit generate --custom` (data-transforming) 을 통해 시작한다. 둘 다
snapshot 을 함께 갱신하기 때문. SQL 파일을 schema TS 수정 없이 직접 손으로
새로 만들거나 (snapshot 동기화 없이) 추가하지 말 것.

> Alembic 갈래에는 snapshot 개념이 없다 (모델 자체가 진실원). 대신
> autogenerate 결과를 항상 사람이 검토해야 한다. server default 변경, 타입
> 미세 차이 등은 autogenerate 가 놓치거나 잘못 생성할 수 있다.

**회복 절차** (Drizzle snapshot 이 이미 누적 drift 상태인 경우):

1. `drizzle-kit generate` 실행. 인터랙티브 prompt 가 누적된 변경 수만큼 뜬다
   (rename 후보 vs create). 이름이 명확히 다른 객체는 "create", 실제 rename
   인 경우만 "rename".
2. 생성된 SQL 이 이미 적용된 변경의 누적이라면 그 SQL 은 폐기, snapshot
   파일만 보존.
3. 같은 idx 의 정식 마이그레이션 SQL 을 의도한 변경만 담아 직접 작성해 교체.
   journal entry 의 tag 도 의도에 맞게 정정.
4. 이후 `generate` 는 정상 동작 (snapshot 이 동기화됐으므로).

## 배포 전 체크리스트

- [ ] **갈래 분류**: NestJS(Drizzle) DB 인지 video-model(Alembic) DB 인지 판단했는가
- [ ] **(Drizzle) 유형 분류**: schema-only 인지 data-transforming 인지 판단했고
      그에 맞는 generate 경로(기본 vs `--custom`) 로 시작했는가
- [ ] **(Drizzle) snapshot 동기화**: `drizzle-kit generate` 재실행이
      "No schema changes" 출력 → snapshot 과 schema TS 가 일치
- [ ] **(Alembic) 리비전 검토**: `revision --autogenerate` 산출물을 사람이
      읽고 데이터 변환/서버 default/타입 diff 를 검증했는가
- [ ] **로컬 검증**: Drizzle `npm run drizzle:migrate:groupware`, Alembic
      `uv run alembic upgrade head` 로 dev DB 적용 성공
- [ ] **데이터 변환 검증** (data-transforming 만): 임시 DB 에 prod-like 데이터
      seed 후 마이그레이션 실행 → 매핑 결과 수동 확인
- [ ] **SQL 위험 검토**: DROP TABLE/COLUMN, NOT NULL 추가, 큰 테이블 lock 등은
      prod 영향 분석 + 2-phase deploy 검토
- [ ] **(Drizzle) hash 무결성**: 이미 staging/prod 에 적용된 `0NNN_*.sql` 은
      손대지 않았는지 git diff 확인 (수정 시 hash mismatch 로 다음 배포 abort)
- [ ] **(Drizzle) 트랜잭션 가능 여부**: `CREATE INDEX CONCURRENTLY` 등 트랜잭션
      외부 실행이 필요한 명령은 별도 마이그레이션 파일로 분리
- [ ] **자동 백업** 활성 + 최근 PITR 시점 확인 (위험 변경 직전 수동 snapshot 권장)
- [ ] **staging 통과**: prod 직전 staging 에서 같은 마이그레이션이 깨끗이
      적용됐는지 (실제 데이터 영향까지 확인)

---

## 참고 문서

- [Drizzle ORM 공식 문서](https://orm.drizzle.team/docs/overview)
- [Alembic 공식 문서](https://alembic.sqlalchemy.org/en/latest/)
- [clean-architecture-structure.md](./clean-architecture-structure.md)
- [api-architecture.md](./api-architecture.md)
