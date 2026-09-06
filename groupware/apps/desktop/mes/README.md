# @csc/desktop-mes

MES 생산현장 PC 앱. SvelteKit(adapter-static) + Tauri.

**이 레포의 첫 데스크톱 앱**이라 기존 web 앱 2개와 다른 점이 몇 가지 있다. 아래를 먼저 읽는다.

## 왜 다른가

| 항목 | apps/web/* | 여기 |
|---|---|---|
| adapter | adapter-node (BFF 서버) | **adapter-static** (SPA) |
| 서버 코드 | `+server.ts`, `hooks.server.ts` | **없다** |
| 데이터 출처 | BFF 경유 백엔드 | **로컬 SQLite** (Rust 가 소유) |
| 인증 | httpOnly 쿠키 + `X-Service-Token` | OS 키체인 + 유저 JWT + 디바이스 토큰 |
| `pnpm dev` | 자동 기동 | **자동 기동 안 함** (아래) |

이유는 하나다. **오프라인 우선.** 공장 네트워크가 끊겨도 라인이 멈추면 안 되므로 원격 서버에서
HTML/JS 를 받아오는 구조를 쓸 수 없다.

## 실행

```bash
# 데스크톱 창 (Tauri + vite). Rust 툴체인 필요, 첫 빌드는 수 분
pnpm dev:mes                                   # 레포 루트에서
pnpm --filter "@csc/desktop-mes" dev:desktop   # 같은 것

# 브라우저만 (Rust 없이 화면 개발). 로컬 저장소는 인메모리 어댑터로 대체된다
pnpm --filter "@csc/desktop-mes" dev:web       # http://127.0.0.1:5175

# 정적 빌드 (Node 만 있으면 된다)
pnpm --filter "@csc/desktop-mes" build

# 번들링 (Rust 필요). Phase 0 은 tauri.conf.json 의 bundle.active 가 false 다
pnpm --filter "@csc/desktop-mes" bundle
```

**`pnpm dev` 기본 세트에 들어가지 않는다.** Tauri 창은 포트를 열지 않아 `scripts/dev-apps.mjs`
의 TCP 프로브로 살아있는지 판정할 수 없고, 첫 cargo 빌드가 수 분이라 매번 네이티브 창이 뜨면
전체 dev 경험이 망가진다. 대신 `MANUAL_APPS` 에 등록되어 있어 `pnpm kill:mes-desktop` 은 동작한다
(Tauri dev 는 node + cargo + exe 3층 트리라 포트 하나만 봐서는 정리되지 않는다).

**`dev` 라는 이름의 스크립트를 두지 않는다.** turbo 가 `pnpm dev` 에서 자동으로 집어간다.

## Rust

```bash
cd src-tauri
cargo test -p mes-contracts -p mes-core -p mes-store -p mes-sync   # Tauri 없이 돈다
cargo clippy -p mes-contracts -p mes-core -p mes-store -p mes-sync -- -D warnings
cargo fmt --all --check
```

crate 분할:

```
src-tauri/                워크스페이스 루트이자 Tauri 앱 crate(mes-app). 얇게 유지한다
└── crates/
    ├── mes-contracts/    TS 계약의 미러. IO 없음
    ├── mes-core/         도메인 로직(outbox 상태 머신, 버전 판정). IO 없음
    ├── mes-store/        SQLite 소유. rusqlite 가 이 밖으로 새지 않는다
    └── mes-sync/         pull/push/연결 판정
```

`mes-core` 와 `mes-contracts` 가 IO 를 모르는 것이 규칙이다. 그래야 테스트가 밀리초 단위로 돌고
리눅스 CI 에서 Tauri 없이 검사된다(`.github/workflows/checks.yml` 의 `desktop-rust` 잡).

## 계약

서버와의 계약 SSOT 는 **TypeScript**(`packages/mes-contracts`)이고 Rust 는 미러다.
둘이 갈라지면 조용히 망가지므로 CI 가 막는다.

```bash
node scripts/check-mes-contracts.mjs   # enum 값 집합 + 전송 필드명 + WIRE_VERSION
```

골든 픽스처(`packages/mes-contracts/fixtures/`)는 세 곳이 함께 읽는다: csc-mes 의 Jest,
이 앱의 Rust serde 테스트, 이 앱의 TS 테스트.

## 설정

`%APPDATA%/csc-mes/config.json` > 빌드 상수 > 하드코딩 기본값.

서버 주소를 빌드에 구우면 이미 현장에 깔린 앱은 고칠 방법이 없다. 클라우드와 온프렘 폐쇄망에
**같은 바이너리**로 나가야 하므로 런타임 주입이 전제 조건이다. 적용된 값은 `/diagnostics` 에서
확인한다.

## 참고

- [동기화 프로토콜](../../../docs/specs/mes-sync-protocol.md)
- [클라이언트 호환성 정책](../../../docs/specs/mes-client-compatibility.md)
- [릴리스 런북](../../../docs/runbooks/mes-desktop-release.md)
- [현장 문제 대응 런북](../../../docs/runbooks/mes-field-troubleshooting.md)
