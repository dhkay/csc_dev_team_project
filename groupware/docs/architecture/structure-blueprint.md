# 아키텍처 구조 청사진

> 이 문서는 csc_project 의 **폴더 구조 골격**입니다. 세부 파일은 생략하고
> **계층 패턴**에 집중합니다. 백엔드는 프레임워크별로 `apps/api/nestjs/`, `apps/api/fastapi/`
> 하위에 서버를 둡니다.
>
> - **백엔드 (NestJS / FastAPI)** → 헥사고날 (Ports & Adapters)
> - **프론트엔드 (SvelteKit)** → 변형된 레이어드 (Feature-Sliced Design 변형)

---

## 0. 모노레포 최상위

```
project-root/
├── apps/
│   ├── api/                      # 백엔드 서버들 (모두 헥사고날). 프레임워크별로 묶는다.
│   │   ├── nestjs/               # NestJS 서버군 (pnpm 워크스페이스)
│   │   │   ├── csc-groupware/    #   csc 그룹웨어 API
│   │   │   ├── csc-control-tower/#   csc 컨트롤타워 API
│   │   │   └── user/             #   인증/계정 API (앱, 웹, 관리자 다중 유저 타입)
│   │   └── fastapi/              # FastAPI 서버군 (각 서버 uv 로 관리, §2)
│   │       ├── marketing-video/  #   마케팅 영상 제작 자동화 + FFmpeg 영상 처리
│   │       └── file-upload/      #   파일 업로드/오브젝트 스토리지 (presigned URL)
│   ├── web/                      # 프론트엔드 서버들 (SvelteKit BFF)
│   │   ├── groupware/            # 그룹웨어 사용자 웹 (csc-groupware API 와 짝)
│   │   └── control-tower/        # 컨트롤타워 관리자 웹 (csc-control-tower API 와 짝)
│   └── desktop/                  # 데스크톱 앱 (SvelteKit adapter-static + Tauri, §5)
│       └── mes/                  # MES 현장 PC 앱 (csc-mes API 와 짝)
├── packages/                     # 공유 패키지 (workspace)
│   ├── database/                 # 공유 DB 스키마 (Drizzle ORM): NestJS 서버군 전용
│   ├── shared-ui/                # 공유 UI 컴포넌트
│   └── net-utils/                # 네트워크 유틸
├── docs/                         # 문서 (specs, runbooks, qa, workspace ...)
├── infra/                        # Docker / nginx / 배포 스크립트
├── pnpm-workspace.yaml           # 워크스페이스: apps/{api/nestjs,api/fastapi,web,desktop,tools}/*, packages/*
└── turbo.json
```

> **명명 규칙**: 프레임워크 그룹 디렉토리(`nestjs/`, `fastapi/`)가 언어를 드러내므로
> FastAPI 서버 이름에 `-py` 접미사를 붙이지 않는다. FastAPI 서버는 `uv` 로 관리하며
> pnpm 워크스페이스에는 포함하지 않는다.

핵심 분리 원칙:
- **apps/api** = 게이트키퍼 서버군. 각 서버는 자기 DB만 직접 접근, 타 도메인은 HTTP 호출.
- **apps/web** = BFF(Backend-for-Frontend). 브라우저는 자기 web 서버만 호출.
- **apps/desktop** = 설치형 클라이언트. **서버가 아니다**(포트를 열지 않고 컨테이너로 배포되지
  않는다). BFF 가 없어 백엔드를 직접 호출한다.
- **packages** = 여러 app 이 공유하는 횡단 자산.

> **왜 apps/web 이 아니라 apps/desktop 인가** (둘 다 SvelteKit 인데도):
> 1. `deploy-*.yml` 의 paths-filter 가 `apps/web/**` 를 잡아 web 스택 전체를 `--no-cache` 로
>    재빌드한다. 데스크톱 아이콘 하나 바꾼 커밋이 20여 개 컨테이너를 재기동시키면 안 된다.
> 2. `apps/web/*` 는 "adapter-node + `routes/api/**/+server.ts` BFF" 라는 계약을 갖고
>    `scripts/check-bff-routes.mjs` 가 그것을 검사한다. 데스크톱은 adapter-static 이라 BFF 가 없다.
> 3. 빌드 프로파일이 다르다. web 은 Linux 컨테이너, 데스크톱은 Windows 러너 + Rust 툴체인.

> **새 앱을 어디에 두는가** (위 결정을 일반 규칙으로):
> **1층 = 배포 타깃**(`api` 컨테이너 서버 / `web` BFF 웹 / `desktop` 설치형 / `tools` 사내 도구),
> **2층 = 스택**. 2층은 **같은 버킷에 스택이 둘 이상일 때만** 만든다. `apps/api` 는 pnpm(NestJS)과
> uv(FastAPI)가 공존해서 `nestjs/` `fastapi/` 가 있고, `apps/web` 은 SvelteKit 하나뿐이라 없다.
> 새 배포 타깃(예: 모바일 `APP_USER`)이 생기면 1층 버킷을 늘리고, 같은 버킷에 두 번째 스택
> (예: Next 관리 웹)이 들어오면 그때 `apps/web/{sveltekit,nextjs}/` 처럼 2층을 **가산 추가**한다.
> 미리 만들어두지 않는다.
>
> 스택을 1층에 두지 않는 이유 셋:
> 1. **자동화가 타깃으로 갈린다.** `deploy-*.yml` 의 `web` 필터는 `apps/web/**` 와
>    `apps/api/nestjs/**`, `apps/tools/**` 를 한 덩어리로 묶는다. 기준은 프레임워크가 아니라
>    "web-server 호스트로 컨테이너가 나가느냐"다(위 1, 3번이 그 사례).
> 2. **앱 하나가 스택 여러 개를 겹친다.** 데스크톱은 SvelteKit + Tauri + Rust 라 스택 우선이면
>    `sveltekit/mes` 인지 `tauri/mes` 인지 답이 없다. 배포 타깃은 앱당 하나로 확정된다.
> 3. **프레임워크가 배포 계약보다 자주 바뀐다.** 어댑터 교체나 메이저 마이그레이션 때마다 1층
>    디렉터리 이름이 흔들리면 경로 참조가 전부 깨진다. "서버냐 설치형이냐"는 앱 수명 내내 안 바뀐다.

---

## 1. 백엔드: 헥사고날 (NestJS)

### 1-1. 서버 1개의 골격

```
apps/api/nestjs/<server>/src/     # 예: csc-groupware / csc-control-tower / user
├── domains/                      # 도메인 단위로 헥사곤 1개씩
│   ├── <domain-A>/
│   ├── <domain-B>/
│   └── ...
├── shared/                       # 도메인 횡단 공유물
│   ├── adapters/outbound/        # 타 서버 HTTP 클라이언트 (예: csc-groupware → user)
│   ├── domain/errors/            # DomainException, ErrorCode enum
│   ├── infrastructure/           # auth / security / filters / email / time
│   ├── types/
│   └── utils/
├── app.module.ts                 # 루트 DI 조립
└── main.ts                       # 부트스트랩
```

### 1-2. 도메인 1개의 헥사곤 (가장 중요한 반복 단위)

```
domains/<domain>/
├── core/                                 # 비즈니스 핵심 (외부를 모름)
│   ├── domain/
│   │   ├── entities/                     #   순수 TS interface (ORM 무관)
│   │   ├── types/                        #   Enum, Type
│   │   └── index.ts
│   └── application/
│       ├── ports/
│       │   ├── inbound/                  #   서비스 호출 계약 (Controller가 사용)
│       │   └── outbound/                 #   외부 의존성 계약 (Service가 사용)
│       └── services/                     #   Inbound Port 구현 = 비즈니스 로직
│           └── __tests__/                #   Service 단위 테스트 (1순위)
│
├── adapters/                             # 외부 세계 연결
│   ├── inbound/
│   │   └── http/
│   │       ├── controllers/              #   HTTP → Inbound Port 호출
│   │       ├── dto/                      #   요청/응답 검증
│   │       ├── filters/
│   │       └── mappers/
│   └── outbound/
│       ├── db/<dbname>/                  #   Outbound Port 구현 (Drizzle ORM)
│       │   └── mappers/                  #   ORM Row ↔ Domain Entity 변환
│       └── external/                     #   타 도메인/서버 접근
│
├── __mocks__/                            # 테스트용 Port Mock 팩토리
└── <domain>.module.ts                    # 도메인 DI 조립 (Port → 구현 바인딩)
```

의존성 방향 (항상 안쪽을 향함):

```
Controller ──▶ Inbound Port ◀── Service ──▶ Outbound Port ◀── Repository Adapter ──▶ DB
(adapter)      (interface)     (core)        (interface)        (adapter)
```

규칙 요약:
| 계층 | import 허용 | import 금지 |
|------|------------|------------|
| domain / port / service | core 내부만 | 외부 패키지, ORM |
| inbound adapter | dto, core/domain, ports/inbound | ORM 직접 |
| outbound adapter | ORM(`@scope/database`), core/domain, mappers | 없음 |

### 1-3. 한 도메인이 같은 일을 여러 방식으로 하는 경우 (버전별 구현)

같은 도메인 안에서 **규칙만 다른 여러 벌**이 필요해질 때가 있다. csc 에서는 마케팅 영상 도구의
UI 버전(v1.0 / v1.5)이 그렇다: 산출물의 종류와 저장 위치는 같은데 프롬프트 조립과 렌더 스펙 조립이
갈린다.

이때 **도메인 트리를 복제하지 않는다.** 헥사곤 하나를 유지하고, 갈리는 지점에만 구현 폴더를 둔다.

```
domains/<domain>/core/
├── application/ports/outbound/
│   └── <seam>.port.ts                    # 갈리는 지점의 계약 + DI 토큰(레지스트리용)
└── domain/<seam>/
    ├── v10/…                             #   그 버전의 구현
    ├── v15/…
    └── index.ts                          #   두 구현을 모아 내보낸다
```

선택은 **exhaustive 레지스트리**가 한다. 맵이나 스위치로 두면 축이 늘 때 런타임 `undefined` 가 되어
그 버전에서만 조용히 터진다.

```ts
type VersionRegistry<T> = Readonly<Record<Version, T>>;   // 값을 더하면 빈 슬롯이 컴파일을 막는다
```

지키는 규칙 넷.

1. **축은 주소로 온다.** 요청이 명시하고 서버가 유추하지 않는다. 유추하면 화면이 보는 것과 쓰기가 쓴
   것이 갈릴 수 있다.
2. **조회는 축을 포함한 스코프 객체로만 한다.** 위치 인자로 늘리면 빠뜨릴 자리가 늘고, 어댑터마다
   필터가 복붙된다.
3. **비동기 재개는 축을 불변 payload 에서 읽는다.** 요청 스코프 DI 는 요청 밖(사가 복구, 워커)에서
   성립하지 않는다.
4. **공유 커널은 축을 모른다.** 저장소, 원장, 사가 엔진처럼 여러 축이 함께 쓰는 것은 그대로 둔다.

갈림이 **문구나 데이터**면 버전마다 파일을 두고(각자 자기 것을 들고 있는 편이 읽기 쉽다), **클래스
교체**면 지금은 한 구현을 두 슬롯이 가리킨다(복제한 빈 클래스는 차이를 찾게만 만든다).

`<Version>` 자리에는 다른 축도 들어갈 수 있다(요금제, 지역, 테넌트 계약). 같은 구조를 쓴다.
csc 의 구체적인 규칙은 [../specs/marketing-tool-versions.md](../specs/marketing-tool-versions.md).

---

## 2. 백엔드: 헥사고날 (FastAPI / Python). FastAPI 서버군

> csc 는 `apps/api/fastapi/` 아래에 FastAPI 서버를 둔다 (예: `marketing-video`, `file-upload`).
> NestJS 와 동일한 헥사고날 개념을 Python 관용으로 그대로 옮긴다.
> - DI: FastAPI `Depends`
> - DTO: Pydantic
> - **ORM: SQLAlchemy 2.0** (`Mapped[...]` / `mapped_column` 타입 어노테이션 스타일,
>   `DeclarativeBase`. 비동기는 `async_sessionmaker` + `AsyncSession`)
> - **마이그레이션: Alembic** (`alembic revision --autogenerate` → `alembic upgrade head`)
>
> **패키지 매니저는 `uv`**: 의존성/락파일/가상환경/실행을 모두 uv 로 관리한다.
> (`uv add <pkg>`, `uv sync`, `uv run <cmd>`. 락파일은 `uv.lock`.)

### 2-1. 서버 1개의 골격

```
apps/api/fastapi/<server>/        # 예: marketing-video / file-upload
├── app/
│   ├── domains/                  # 도메인 단위로 헥사곤 1개씩
│   │   ├── <domain-A>/
│   │   └── <domain-B>/
│   ├── shared/                   # 도메인 횡단 공유물
│   │   ├── adapters/outbound/    #   타 서버 HTTP 클라이언트
│   │   ├── domain/errors/        #   DomainException + ErrorCode (Enum)
│   │   ├── infrastructure/       #   auth / security / middleware / time
│   │   ├── types/
│   │   └── utils/
│   ├── config.py                 # 환경변수 (pydantic-settings)
│   ├── container.py              # DI 조립 (Depends provider 정의)
│   └── main.py                   # FastAPI() 부트스트랩 + 라우터 등록
├── tests/
├── pyproject.toml                # uv 프로젝트 정의 ([project], deps)
├── uv.lock                       # uv 락파일
└── alembic/                      # DB 마이그레이션 (이 서버가 DB 소유 시)
```

### 2-2. 도메인 1개의 헥사곤 (반복 단위)

```
domains/<domain>/
├── core/                                 # 비즈니스 핵심 (외부를 모름)
│   ├── domain/
│   │   ├── entities.py                   #   순수 dataclass / Pydantic 모델 (ORM 무관)
│   │   └── types.py                      #   Enum, Type
│   └── application/
│       ├── ports/
│       │   ├── inbound.py                #   Protocol/ABC: 서비스 호출 계약
│       │   └── outbound.py               #   Protocol/ABC: 외부 의존성 계약
│       └── services.py                   #   Inbound Port 구현 = 비즈니스 로직
│
├── adapters/                             # 외부 세계 연결
│   ├── inbound/
│   │   └── http/
│   │       ├── router.py                 #   APIRouter → Inbound Port 호출
│   │       ├── schemas.py                #   Pydantic 요청/응답 DTO
│   │       └── mappers.py
│   └── outbound/
│       ├── db/                           #   Outbound Port 구현 (SQLAlchemy 2.0)
│       │   ├── repository.py             #   AsyncSession 으로 쿼리 실행
│       │   ├── models.py                 #   DeclarativeBase + Mapped[...] 테이블 매핑
│       │   └── mappers.py                #   ORM 모델 ↔ Domain Entity 변환
│       └── external/                     #   타 도메인/서버 접근
│
├── tests/                                # Service 단위 테스트 (Port를 fake로 주입)
└── module.py                             # 도메인 DI wiring (Port → 구현 바인딩)
```

의존성 방향은 NestJS 와 동일 (항상 안쪽을 향함):

```
router ──▶ Inbound Port ◀── service ──▶ Outbound Port ◀── repository ──▶ DB
(adapter)  (Protocol/ABC) (core)        (Protocol/ABC)     (adapter)
```

### 2-3. Python 매핑 / 관용 치환표

| 헥사고날 개념 | NestJS | **FastAPI / Python** |
|---|---|---|
| Inbound/Outbound Port | `interface` + `Symbol` 토큰 | `Protocol` 또는 `ABC` |
| Service | `@Injectable()` 클래스 | 일반 클래스 (생성자에 Port 주입) |
| DI 바인딩 | `@Module` providers | `Depends()` provider (`container.py`) |
| DTO 검증 | `class-validator` DTO | Pydantic `BaseModel` |
| Controller | `@Controller` | `APIRouter` |
| Repository Adapter | Drizzle ORM | SQLAlchemy 2.0 (`AsyncSession`) |
| ORM 모델 정의 | Drizzle schema | `DeclarativeBase` + `Mapped[...]` / `mapped_column` |
| 도메인 예외 → HTTP | ExceptionFilter | `exception_handler` |
| 마이그레이션 | drizzle-kit | Alembic (`--autogenerate`) |
| 패키지 매니저 | pnpm | **uv** (`uv add` / `uv sync` / `uv run`) |

> **계층 import 규칙은 그대로 유지**: `core`(domain/ports/services)는 FastAPI, 
> SQLAlchemy 를 import 하지 않는다. SQLAlchemy 모델(`models.py`)과 도메인 엔티티
> (`entities.py`)는 **별개**다. `mappers.py` 로만 변환하고, ORM 모델을 도메인 밖으로
>새지 않게 한다. Port 는 `Protocol`/`ABC` 로만 선언하고 구현은 `adapters/`에만 둔다.
> 이것이 NestJS↔FastAPI 사이에서 변하지 않는 핵심 불변식.

---

## 3. 공유 DB 패키지

```
packages/database/src/
├── groupwaredb/                       # DB 1개 = 디렉토리 1개
│   ├── schema/                   #   enums / *-tables / relations / index
│   ├── drizzle-client.ts         #   싱글톤 클라이언트 (groupwareDb, groupwareSql)
│   ├── drizzle.config.ts
│   └── index.ts                  #   barrel export
├── userdb/                       # (동일 구조)
├── controltowerdb/                      # (동일 구조)
└── index.ts
```

> **서버별 DB 소유권 원칙**: 한 DB 는 한 서버만 직접 소유한다. 이 공유 패키지(Drizzle)는
> NestJS 서버군 전용이다. FastAPI 서버는 자체 DB 를 공유 패키지에 두지 말고, 해당 서버
> 안에서 SQLAlchemy 2.0 모델 + Alembic 으로 자체 관리한다
> (`apps/api/fastapi/<server>/app/.../db/models.py` + `apps/api/fastapi/<server>/alembic/`).
> 타 서버 데이터가 필요하면 직접 접근하지 말고 HTTP 로 호출.

---

## 4. 프론트엔드: 변형 레이어드 (SvelteKit)

FSD(Feature-Sliced Design)를 SvelteKit BFF에 맞게 변형. **위 레이어가 아래 레이어를
import** 하는 단방향 의존.

### 4-1. 앱 골격

```
apps/web/groupware/src/
├── routes/                       # SvelteKit 라우팅 + BFF 진입점
│   ├── api/<domain>/+server.ts   #   BFF: 브라우저 ↔ 백엔드 API 중계 (토큰 주입)
│   ├── <page>/+page.svelte       #   페이지 셸 (+page.server.ts 로 SSR 가드)
│   ├── +layout.svelte
│   └── hooks.server.ts (src/)    #   토큰 자동 갱신 등 글로벌 훅
└── lib/
    ├── app/                      # 앱 전역: config / providers / styles
    ├── pages/                    # 페이지 레이어 (라우트별 UI 조립)
    ├── widgets/                  # 독립 UI 블록 (모달, 배너, 메뉴 ...)
    ├── features/                 # 도메인 기능 단위 (사용자 행위)
    ├── shared/                   # 최하위 공유 (ui / lib / types / styles)
    ├── infrastructure/           #   횡단 인프라 (http / logging / storage ...)
    └── custom-packages/
```

레이어 의존 방향 (위 → 아래만 허용):

```
routes ──▶ pages ──▶ widgets ──▶ features ──▶ shared
                                      └──────────▶ infrastructure ──▶ shared
```

### 4-2. feature 1개의 골격 (반복 단위)

```
lib/features/<feature>/
├── apis/                         # 백엔드(BFF) 호출 함수
├── queries/                      # 조회 로직 (캐시/패칭)
├── mutations/                    # 변경 로직
├── services/                     # 기능 비즈니스 로직
├── hooks/                        # Svelte 훅
├── constants/
├── translations/                 # 기능 전용 i18n
├── types/
└── utils/
```

### 4-3. shared 레이어 (최하위 공용)

```
lib/shared/
├── ui/                           # 순수 프레젠테이션 컴포넌트
│   ├── controls/ content/ navigation/ overlays/ display/ ...
├── lib/
│   ├── stores/                   # Svelte 5 상태 ($state): 도메인별 분기
│   ├── services/ hooks/ actions/ utils/ i18n/ config/ constants/
├── translations/
├── types/
└── styles/
```

### 4-4. infrastructure (횡단 관심사)

```
lib/infrastructure/
├── http/                         # 클라이언트 인스턴스 + 인터셉터 + 라우트맵
│   └── interceptors/
├── logging/
├── maintenance/                  # 점검 모드 가드
├── rate-limit/
└── storage/file-upload/          # 업로드 파이프라인 (apis/handlers/services/...)
```

---

## 5. 데스크톱: SvelteKit(adapter-static) + Tauri

현장 PC 앱은 앞의 web 앱들과 **레이어 규칙은 같고 두 지점만 다르다.**

```
apps/desktop/mes/
├── src/
│   ├── routes/                   # +layout.ts 가 ssr=false 로 SPA 고정
│   └── lib/
│       ├── app/config/           # 런타임 config.json 로더 (빌드 상수보다 우선)
│       ├── pages/ widgets/ features/ shared/    # web 앱과 동일 레이어
│       └── infrastructure/
│           ├── local/            #   로컬 저장소 포트 + 어댑터 2종
│           ├── sync/             #   Rust 동기화 워커 이벤트 구독
│           └── device/           #   스캐너/프린터/PLC 포트
└── src-tauri/                    # Rust. 워크스페이스 루트이자 앱 crate
    ├── src/                      #   Tauri 바인딩 (얇게 유지)
    └── crates/
        ├── mes-contracts/        #   TS 계약의 Rust 미러 (serde)
        ├── mes-core/             #   도메인 로직. IO 를 모른다
        ├── mes-store/            #   SQLite 소유 (rusqlite 가 여기서 안 샌다)
        └── mes-sync/             #   pull/push/연결 판정
```

**다른 지점 1: `apis/` 의 의미가 바뀐다.**

```
web 앱:      features/apis -> frontClient() -> 자기 BFF -> 백엔드
데스크톱:    features/apis -> localStore    -> 로컬 SQLite
                                                  ↑ Rust 동기화 워커가 서버와 맞춘다
```

**feature 코드는 서버를 모른다. 로컬 DB 만 안다.** 네트워크는 feature 의 관심사가 아니다.

**다른 지점 2: BFF 가 하던 일을 Rust 가 받는다.**

| BFF 가 지키던 성질 | web 앱 | 데스크톱 |
|---|---|---|
| 토큰이 JS 에 노출되지 않음 | httpOnly 쿠키 | OS 키체인. 렌더러는 `invoke()` 만 안다 |
| 브라우저가 백엔드 주소를 모름 | 같은 origin `/api/*` | URL 이 Rust 설정에만 존재 |
| 백엔드가 신뢰된 호출자 확인 | `X-Service-Token` | **성립 불가.** 현장 PC 는 신뢰된 서버가 아니다 |

세 번째가 이 앱의 핵심 제약이다. `SERVICE_TOKEN_SECRET` 은 전 백엔드가 공유하므로 현장 PC
바이너리에 넣으면 유출 하나로 모든 csc 서버가 위조 호출에 열린다. 그래서 csc-mes 는 유저 JWT +
디바이스 토큰이라는 별도 인증 경로를 갖는다(`docs/specs/service-http-contract.md`).

Rust crate 분할 규칙: **`mes-core` 와 `mes-contracts` 는 IO 를 모른다.** 그래야 테스트가
밀리초 단위로 돌고, Tauri 없이 리눅스 CI 에서 검사된다.

---

## 6. 요청 흐름 한눈에 (이식 시 골격 검증용)

```
[브라우저]
   │  GET '/api/<domain>/...'  (자기 web 서버만 호출)
   ▼
[web/routes/api/<domain>/+server.ts]   ← BFF (토큰 주입, 백엔드 중계)
   │  서버 간 호출 시 서비스 토큰 첨부
   ▼
[api/.../adapters/inbound/http]   ← Inbound Adapter
   │   NestJS: controllers + dto   |   FastAPI: router.py + schemas.py
   ▼
[core/application/services]   ← Inbound Port 구현 (비즈니스 로직)
   │
   ▼
[core/application/ports/outbound]   ← 인터페이스 (NestJS: interface / FastAPI: Protocol)
   ▲
[adapters/outbound/db/...]   ← Repository Adapter
   │   NestJS: Drizzle ORM(groupwaredb/...)   |   FastAPI: SQLAlchemy 2.0(AsyncSession)
   ▼
[PostgreSQL]
```

---

## 7. 새 프로젝트 이식 체크리스트

**백엔드 (도메인 추가 시)**
- [ ] `domains/<d>/core/domain/{entities,types}`: 순수 타입 먼저
- [ ] `core/application/ports/{inbound,outbound}`: 계약 정의
- [ ] `core/application/services`: Inbound Port 구현, Outbound Port 주입
- [ ] `adapters/inbound/http/{controllers,dto}`: HTTP 진입
- [ ] `adapters/outbound/db/<dbname>/{adapter,mappers}`: DB 구현
- [ ] `<d>.module.ts`: Port↔구현 바인딩 + `__mocks__` 테스트 픽스처

**프론트 (기능 추가 시)**
- [ ] `routes/api/<d>/+server.ts`: BFF 엔드포인트
- [ ] `lib/features/<d>/{apis,queries,mutations,services}`: 기능 로직
- [ ] `lib/widgets` 또는 `lib/pages`: UI 조립 (shared/ui 재사용)
- [ ] 상태는 `lib/shared/lib/stores/<d>`: 위 레이어가 아래만 import 하는지 확인

**데스크톱 (신규 앱 추가 시)**
- [ ] `apps/desktop/<app>/`: adapter-static + `+layout.ts` 의 `ssr=false`
- [ ] `pnpm-workspace.yaml`: `apps/desktop/*` 글롭(이미 있음)
- [ ] `scripts/dev-apps.mjs`: `MANUAL_APPS` 에 등록. **`APPS` 가 아니다**
      (Tauri 창은 포트를 안 열어 TCP 프로브로 판정 불가 + 첫 cargo 빌드가 수 분)
- [ ] `scripts/kill.mjs`: `DEV_SIGNATURES` 에 실행 방식 지문
- [ ] `turbo.json`: `bundle` 태스크는 `cache: false`
      (Rust 산출물이 `outputs` 에 없어 캐시하면 "산출물 없는 성공" 이 캐시된다)
- [ ] `.dockerignore`: `**/src-tauri/target` (없으면 전 백엔드 이미지 빌드가 느려진다)
- [ ] `dev` 라는 이름의 스크립트를 두지 않는다(turbo 가 `pnpm dev` 에서 집어간다)
- [ ] 런타임 설정 파일 로더: 서버 주소를 빌드에 구우면 이미 배포된 앱은 못 고친다

**공유**
- [ ] `packages/database/src/<dbname>`: DB 소유권은 서버 1개에만
- [ ] 서버 간 데이터는 직접 DB 접근 금지 → HTTP 호출 + 서비스 토큰
- [ ] 두 언어가 같은 계약을 구현하면(TS ↔ Python, TS ↔ Rust) **미러 검사 스크립트**를 만든다.
      복제본은 반드시 갈라지고, 갈라지면 조용히 망가진다
      (`scripts/check-log-contracts.mjs`, `scripts/check-mes-contracts.mjs`)
```
