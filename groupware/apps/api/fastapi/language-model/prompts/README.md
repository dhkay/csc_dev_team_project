# prompts/: AI 프롬프트 자산 (language-model)

AI에 **주입되는 텍스트/형식**(시스템 프롬프트, 지시, 출력 형식, few-shot)을 코드에서 분리해 여기에 둔다.
이 서버가 소유하고 이 서버만 읽는다. 다른 서버는 프롬프트가 아니라 **기능(API)** 을 호출한다.

> 범위: **프롬프트 주입 자산만.** RAG 지식문서(검색 대상)는 여기 두지 않는다(추후 `retrieval` 도메인/별도 영역).

## 구조

```
prompts/
├── shared/                 # 여러 기능이 재사용하는 공통 조각
│   ├── persona/            # 역할/톤 (누구인가)
│   ├── format/             # 출력 형식 스펙 (JSON/마크다운/길이 등)
│   └── guardrails/         # 금지/안전/정책
└── features/               # 기능별 자산 (기능마다 참고 문서가 다름)
    └── <feature-id>/
        ├── manifest.toml   # ← 이 기능이 어떤 조각을 어떤 순서로 합성할지
        └── *.md            # 기능 고유 조각(지시/형식/few-shot 등)
```

## manifest.toml

기능의 프롬프트 = `compose` 에 나열한 조각 .md 를 **순서대로 연결**(구분자 빈 줄).
경로는 `prompts/` 루트 기준. `shared/*` 를 참조해 **재사용**, 기능 고유 조각은 `features/<id>/*` 로.

```toml
# features/chat-assistant/manifest.toml
id = "chat-assistant"
locale = "ko"
version = 1
compose = [
  "shared/persona/assistant.ko.md",
  # "features/chat-assistant/instructions.ko.md",   # 기능 고유 지시(있으면)
  # "shared/format/markdown-article.md",             # 출력 형식(필요하면)
]
```

## 소비 방식 (코드)

`PromptLibrary.render("<feature-id>")` → manifest 를 읽고 조각을 합성한 문자열 반환(프로세스 캐시).
서비스는 outbound 포트 `PromptLibraryPort` 로 주입받아 쓴다(하드코딩 프롬프트 금지).
로더: `app/shared/prompts/library.py`. 루트 경로 오버라이드: 환경변수 `PROMPTS_DIR`(미설정 시 이 폴더).

## 네이밍/규약

- 파일명: kebab-case + 로케일 접미(`assistant.ko.md`). 로케일 무관이면 접미 생략(`json-strict.md`).
- 조각은 **작고 단일 책임**(역할 / 형식 / 금지 를 섞지 말 것) → 재사용성↑.
- 변경 이력, 버전은 git 으로. `version` 필드는 큰 개편 시 사람이 올리는 표식(선택).

## 새로 추가할 때

- **공통 조각**: `shared/<종류>/<name>.md` 추가 → 여러 feature 의 manifest 에서 참조.
- **새 기능**: `features/<feature-id>/manifest.toml` + 고유 조각 추가. 서비스가 `render("<feature-id>")` 호출.
