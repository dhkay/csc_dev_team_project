# csc_project

헥사고날 백엔드 + SvelteKit 프론트엔드 모노레포.

## 구성

```
apps/
├── api/
│   ├── nestjs/      csc-groupware, csc-control-tower, user, csc-marketing, csc-mes
│   └── fastapi/     language-model, video-model, file-upload, log-server, data-collector, metrics-agent
├── web/             groupware, control-tower
├── desktop/         mes (현장 PC 앱: SvelteKit adapter-static + Tauri)
└── tools/           scalar-gateway (통합 API 문서 포털)
packages/            database, shared-ui, net-utils, entitlements, mes-contracts, log-client, log-contracts, pricing
docs/, infra/
```

- **백엔드**: 헥사고날(Ports & Adapters). NestJS(Drizzle) + FastAPI(SQLAlchemy/Alembic, uv).
- **프론트엔드**: SvelteKit (FSD 변형, BFF).
- **데스크톱**: SvelteKit(adapter-static) + Tauri. 오프라인 우선(로컬 SQLite + 동기화 큐)이라
  BFF 가 없고 백엔드를 직접 호출한다. 상세는 structure-blueprint 5절.
- **DB 소유권**: 한 DB는 한 서버만 직접 소유, 타 도메인은 HTTP + 서비스 토큰으로 호출.

아키텍처 상세는 [docs/architecture/structure-blueprint.md](docs/architecture/structure-blueprint.md) 와 `.claude/rules/` 참고.

## 시작하기

```bash
# Node 워크스페이스 (NestJS / SvelteKit)
pnpm install

# FastAPI 서버 (각 서버 디렉토리에서)
cd apps/api/fastapi/video-model   # 또는 language-model / file-upload
uv sync
uv run uvicorn app.main:app --reload
```

> 락파일(`pnpm-lock.yaml`, `uv.lock`)은 위 명령으로 생성됩니다.
