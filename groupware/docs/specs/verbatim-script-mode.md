# 완성 대본(Verbatim Script) 입력 모드 — 개발 지침서

## 0. 이 문서의 목적

`apps/web/groupware`(마케팅 영상 도구, v1.5)에 **세 번째 입력 방식**을 추가하기 위한 설계/구현 지침이다.
현재는 "컨셉입력"과 "프롬프트입력" 두 방식만 있고, 둘 다 **AI(LLM)가 새로 기획안을 창작**하는 것을 전제로 한다.
그런데 실사용자는 이미 완성된 대본(Word 문서 형태의 기획서: 장면구성/대사/나레이션이 전부 확정된 상태)을 갖고 있고,
이걸 **그대로** 영상으로 만들고 싶어 한다. 지금 시스템은 이 요구를 지원하지 않는다 — 붙여넣은 텍스트는 "브리프"로만
취급되어 LLM이 재해석/재작성한다.

**목표**: 사용자가 이미 써놓은 장면구성/대사/나레이션을 **한 글자도 바꾸지 않고**, 시스템이 (1) 공급자 제약(세그먼트당
**최대 8초 — Veo 3 기준**)에 맞게 나누고, (2) 세그먼트별로 영상 생성 API를 병렬/순차로 호출하고, (3) 결과를 이어붙여
최종 영상을 만드는 것.

**영상 생성 provider: Google Veo 3**(`veo-3.1-generate-preview`, Gemini API 경유)로 확정.
코드에 이미 이 provider용 어댑터가 있다: `apps/api/fastapi/video-model/app/domains/video/adapters/outbound/processing/gemini_veo_video.py`.
이 어댑터의 `durationSeconds`는 **4 / 6 / 8초 열거값만 받고, 8초가 최댓값**이다(`_ALLOWED_DURATIONS = (4, 6, 8)`).
요청 길이가 열거값에 없으면 **올림(round up)** 해서 맞춘다(내리면 나레이션이 잘리므로). 즉 "8초 단위로 나눠서 병렬
생성 후 합친다"는 요구사항은 **이 provider를 쓰는 한 이미 정확히 그렇게 동작**한다 — 새로 구현할 게 아니라
기존 코드가 이미 이렇게 되어 있다.

---

## 1. 왜 이게 생각보다 작은 작업인가 (핵심 통찰)

이 코드베이스는 파이프라인이 **두 단계로 분리**되어 있고, 이 분리가 우리에게 유리하다.

```
[1단계] 기획서 생성          [2단계] 영상 생성(렌더)
 사용자 입력 → LLM 호출        marketing_saved_plans.scenes(JSON)
 → marketing_saved_plans        → marketing_video_projects 생성
   (scenes: JSON) 저장           → video-model 에 세그먼트별 렌더 요청
                                 → ffmpeg concat + 오디오 믹스 + 자막
```

**2단계(영상 생성)는 1단계가 LLM으로 만들어졌는지, 사람이 손으로 만들었는지 전혀 모른다.** 렌더 파이프라인은
`marketing_saved_plans.scenes` (jsonb, 스키마: `packages/database/src/marketingdb/schema/marketing-tables.ts`의
`VideoProjectSceneJson`)만 보고 동작한다. 즉:

> **1단계에 "LLM 호출을 건너뛰고 사용자가 준 텍스트를 그대로 저장하는" 새 경로 하나만 추가하면, 2단계(분할/병렬생성/합치기)는 손댈 필요가 없다.**

이게 이미 구현되어 있다는 점도 확인됨(2단계는 이미 잘 동작):
- 세그먼트 분할: LLM이 공급자 초 제약(Veo 3 기준 최대 8초)에 맞춰 대사 분량을 스스로 예산 책정 (`apps/api/nestjs/csc-marketing/src/domains/plan-generation/core/domain/prompt/v15/system.ts`)
- 병렬/순차 생성 선택: `apps/web/groupware/src/lib/pages/tools/marketing-video/create/SegmentModeSection.svelte` (`segmentMode: 'sequential' | 'parallel'`)
- 세그먼트별 렌더 + 이어붙이기: `apps/api/fastapi/video-model/app/domains/video/adapters/outbound/processing/compose.py`
- 발화 길이 자동 추정(TTS 없을 때): `apps/api/fastapi/video-model/app/domains/video/adapters/outbound/processing/speech_duration.py`

따라서 이번 작업 범위는 **1단계에 한정**된다: "사용자가 이미 쓴 세그먼트별 대본을 받아서, LLM 없이 `marketing_saved_plans` 행을 만드는 새 입력 경로."

---

## 2. 제안 설계

### 2.1 새 입력 방식 이름
"완성 대본 입력" (가칭). 기존 두 탭("컨셉입력", "프롬프트입력") 옆에 세 번째 탭으로 추가.

### 2.2 프론트엔드 UI

새 컴포넌트 `apps/web/groupware/src/lib/pages/tools/marketing-video/create/VerbatimScriptForm.svelte`
(기존 `ConceptForm.svelte` / `PromptForm.svelte`과 같은 위치, 같은 패턴).

**입력 형태는 두 가지 중 하나를 선택해야 한다(제품 결정 필요, 3.1절 참고):**

- **(A) 반복 가능한 세그먼트 리스트** (권장): "+ 세그먼트 추가" 버튼으로 N개 블록을 만들고, 각 블록에
  - 장면 구성(visualPrompt) — 필수, 자유 텍스트
  - 대사/나레이션(dialogue) — 선택, 자유 텍스트
  - 자막 문구(subtitle.text) — 선택, 자유 텍스트 (없으면 대사와 동일하게 채움)
  - 원하는 길이(durationSec) — 선택. **Veo 3 기준 4/6/8초 중 하나로 올림 처리, 최대 8초.** 비우면 서버가
    `speech_duration.py`로 자동 추정 후 이 값으로 clamp
  이 구조는 docx의 "동영상1(0-8초): 장면 구성.../대화내용..." 블록과 1:1로 대응되어, 사용자가 손으로
  옮겨 적기만 하면 된다(자동 파싱 불필요, 실수 여지 적음).
- **(B) 자동 파싱**: 큰 텍스트박스 하나에 정해진 구분자(예: `---` 또는 `동영상N (..)`)로 구분해서 붙여넣으면
  정규식으로 세그먼트를 나누는 방식. 붙여넣기는 더 빠르지만 문서 포맷이 조금만 달라도 파싱이 깨진다.
  **LLM에게 "파싱만" 시키는 것도 방법이지만(내용 창작은 금지, 포맷만 구조화), 그러면 "한 글자도 안 바꾼다"는
  보장이 약해진다 — LLM은 프롬프트로 통제할 뿐 강제할 수 없다.** 권장하지 않음.

**공통 필드(기존 `VideoSettingsSection.svelte` 재사용)**:
- 영상 모델 선택 (`VideoModelSection`)
- 세그먼트 연결 방식(순차/병렬) (`SegmentModeSection`) — 그대로 재사용

**제외할 것**: `BrandConceptSection`(브랜드/컨셉 세트 선택), 목적 키워드 — 이 방식은 "완전히 사용자가 다 정했다"는
전제이므로 톤을 고르는 화면 자체가 불필요(오히려 혼란을 줌).

### 2.3 versionProfile / 위저드 연결

`apps/web/groupware/src/lib/pages/tools/marketing-video/versionProfile.ts` 를 확인해, 입력 방식 탭 목록을
관리하는 지점(위저드, 아마 `CreateWizard.svelte` 류)에 세 번째 탭을 등록한다. `hasPlanCompose` /
`hasDirectBriefs` 같은 플래그 패턴을 참고해 `hasVerbatimScript: boolean` 같은 프로필 플래그를 하나 추가하는 것을
권장(현재 이 방식이 v1.5 전용인지, v1.0에도 낼지 먼저 결정 — 3.1절 참고).

### 2.4 백엔드: 새 저장 경로 (LLM 우회)

**새 엔드포인트** (또는 기존 `POST :channelId/plans/generate`에 분기 추가):

```
POST /marketing/channels/:channelId/plans/verbatim
```

파일 위치: `apps/api/nestjs/csc-marketing/src/domains/plan-generation/adapters/inbound/http/controllers/plan-generation.controller.ts`
(기존 `generatePlans`(73번째 줄, `:id/plans/generate`)를 참고해 나란히 추가)

**새 DTO**: `apps/api/nestjs/csc-marketing/src/domains/plan-generation/adapters/inbound/http/dto/create-verbatim-plan.dto.ts`

```ts
export class VerbatimSegmentDto {
  @IsInt() order: number;
  @IsString() @IsNotEmpty() visualPrompt: string;   // 장면 구성 — 필수, 그대로 저장
  @IsOptional() @IsString() dialogue?: string;       // 대사/나레이션 — 그대로 저장
  @IsOptional() @IsString() subtitleText?: string;   // 자막 — 없으면 dialogue 로 채움
  @IsOptional() @IsInt() durationSec?: number;       // 없으면 서버가 추정 + clamp
}

export class CreateVerbatimPlanDto {
  @IsInt() organizationId: number;
  @IsInt() ownerUserId: number;
  @IsString() title: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => VerbatimSegmentDto)
  segments: VerbatimSegmentDto[];
  @IsOptional() @IsString() videoModel?: string;
  @IsOptional() @IsString() segmentMode?: string;
}
```

**새 서비스 메서드** (기존 `generate-plans` 유스케이스 옆에 위치, `text-generate-call.ts`를 호출하는 대신):
- `apps/api/nestjs/csc-marketing/src/domains/plan-generation/adapters/outbound/text-generate-call.ts` 를
  **호출하지 않는다.** 즉 `/inference/generate`(language-model) 호출이 아예 없다 — LLM 비용 0, 왜곡 0.
- 대신 `VerbatimSegmentDto[]` → `SavedPlanSceneJson[]` 변환만 하고 바로
  `marketingSavedPlans` 테이블에 INSERT(기존 "기획안 저장" 로직 재사용:
  `plan-generation`의 저장 어댑터 — 기존 `save-plan` 스텝이 쓰는 리포지토리를 그대로 호출).
- `version`, `channelId`, `organizationId`, `ownerUserId`, `videoModel`, `segmentMode` 컬럼은 기존 컬럼
  그대로 채운다(스키마 변경 없음). `brandConcepts`는 null로 둔다(이 방식엔 톤 선택이 없으므로).

### 2.5 길이(초) 처리 — Veo 3 기준

- **provider는 Google Veo 3**(`veo-3.1-generate-preview`) 확정. 이 provider의 clamp 로직은 이미 렌더
  단계(video-model)에 구현되어 있다 — **csc-marketing 쪽에서 새로 만들 필요가 없다.**
  참고 코드: `apps/api/fastapi/video-model/app/domains/video/adapters/outbound/processing/gemini_veo_video.py`
  ```python
  _ALLOWED_DURATIONS = (4, 6, 8)   # durationSeconds 열거값(초), 8초가 최댓값

  def _pick_duration(value):
      # 요청 길이가 열거값에 없으면 올려서 맞춘다(내리면 대사가 잘리므로).
      # 8초를 넘는 값도 8초로 클램프된다(_ALLOWED_DURATIONS[-1] 반환).
      ...
  ```
- 사용자가 `durationSec`를 지정하면: 그대로 저장해서 넘기기만 하면 렌더 단계가 4/6/8초 중 하나로 알아서
  올림 처리한다(csc-marketing은 이 값을 검증/변환할 필요 없음. 다만 UI에서 "8초를 넘는 값은 8초로
  잘려서 나눠 생성됩니다" 정도의 안내는 필요 — 3.5절 참고).
- 사용자가 비워두면: 기존 `estimate_speech_seconds`(`speech_duration.py`)가 `dialogue`/`narration` 텍스트
  길이에서 자동 추정 — **이것도 이미 구현되어 있어 새로 만들 필요 없음.**
- **세그먼트 분할 자체(예: 30초 대본 → 4개 세그먼트)는 이 스펙의 책임이 아니다.** 완성 대본을 이미
  세그먼트 단위로 나눠서 입력받는 게 2.2절 설계(A안)이므로, "8초 넘는 하나의 씬을 자동으로 여러 개로
  쪼개는" 로직은 필요 없다 — 애초에 사용자가 8초 이내로 세그먼트를 나눠서 넣는다고 가정한다(UI에서
  세그먼트별 글자수/예상초를 안내해 주는 것을 권장, 3.5절 참고).

### 2.6 프론트 → 백엔드 연결 이후

`marketing_saved_plans` 행이 생기고 나면, 그 뒤(영상 프로젝트 생성 `POST /video-projects`,
렌더 시작 `POST /video-projects/:id/render`)는 **기존 흐름을 1도 바꾸지 않고 그대로 재사용**한다.
파일: `apps/api/nestjs/csc-marketing/src/domains/video-project/adapters/inbound/http/controllers/video-project.controller.ts`

---

## 3. 결정이 필요한 사항 (구현 전에 정할 것)

### 3.1 입력 UI: (A) 세그먼트 리스트 vs (B) 자동 파싱
위 2.2절 권장은 (A). 손이 조금 더 가지만 "한 글자도 안 바꾼다"는 요구를 100% 지킬 수 있다.
(B)를 원한다면 최소한 "파싱 결과를 사용자가 세그먼트별로 확인/수정할 수 있는 미리보기 화면"을 반드시 넣을 것
(파싱이 틀렸는데 바로 렌더로 넘어가면 원치 않는 결과가 나온다).

### 3.2 이 방식을 v1.0에도 낼 것인가
v1.0은 씬 이미지 생성 + TTS + 최종합성이 있는 더 복잡한 파이프라인이다(1절 참고, `usesSceneImages: true`,
`usesFinalComposite: true`). 완성 대본에 "씬 이미지 프롬프트"까지 포함되어 있다면 v1.0 확장도 가능하지만,
**1차 구현은 v1.5로 한정**하는 것을 권장(요청하신 시나리오가 v1.5 구조와 정확히 맞음: 이미지 없이 텍스트→영상).

### 3.3 세그먼트 개수 상한
`generate-plans.dto.ts`의 `sceneCount` 상한(1~8, `SCENE_COUNT_OPTIONS`)을 참고해 verbatim 방식에도 같은
상한을 걸 것을 권장(렌더 비용/시간 보호 목적). `FOCUS_KEYWORD_MAX`처럼 상수 하나 정의.

### 3.4 조직 API 자격증명 / 실제 공급자 연결
Veo 3(Gemini API)를 쓰려면 조직이 **Google Gemini API 키**를 등록해야 한다(그룹웨어 조직관리 > API 자격증명,
`gemini_provider_key` 관련 설정 — `apps/api/fastapi/video-model/app/config.py`의 `gemini_*` 값 참고). 이건
verbatim 모드 여부와 무관하게 이미 필요한 전제조건이다.

### 3.5 UI에서 "8초 초과" 안내
사용자가 세그먼트 하나에 8초를 넘는 대사/나레이션을 넣으면, 렌더 단계에서 **자동으로 8초로 잘리는 게 아니라
길이만 8초로 클램프되고 텍스트는 안 잘린다** → 8초 안에 다 말하기엔 너무 긴 대사가 들어가 **말이 빨라지거나
일부가 잘려 들릴 위험**이 있다(clamp는 duration만 조정하지 텍스트 분량을 줄여주지 않는다). 따라서
`VerbatimScriptForm.svelte`에 세그먼트별 글자 수를 보여주고, 대략적인 기준(한국어 초당 4~5음절 — 시스템
프롬프트에 이미 있는 값, `prompt/v15/system.ts` 참고)으로 "8초 초과 예상" 경고를 표시하는 것을 권장한다.
필수는 아니지만, 없으면 사용자가 결과물을 받아보고서야 문제를 알게 된다.

---

## 4. 파일 변경 체크리스트

| 파일 | 변경 내용 |
|---|---|
| `apps/web/groupware/src/lib/pages/tools/marketing-video/create/VerbatimScriptForm.svelte` | 신규: 세그먼트 리스트 UI |
| `apps/web/groupware/src/lib/pages/tools/marketing-video/versionProfile.ts` | `hasVerbatimScript` 플래그(또는 유사) 추가 |
| `apps/web/groupware/src/lib/pages/tools/marketing-video/create/CreateWizard.svelte`(또는 탭을 그리는 실제 위저드 파일 — 이름 확인 필요) | 세 번째 탭 등록 |
| `apps/web/groupware/src/lib/features/.../marketingChannels.service.ts` (또는 plan-generation 관련 서비스) | verbatim 생성 API 호출 함수 추가 |
| `apps/api/nestjs/csc-marketing/src/domains/plan-generation/adapters/inbound/http/dto/create-verbatim-plan.dto.ts` | 신규 DTO |
| `apps/api/nestjs/csc-marketing/src/domains/plan-generation/adapters/inbound/http/controllers/plan-generation.controller.ts` | `POST :channelId/plans/verbatim` 추가 |
| `apps/api/nestjs/csc-marketing/src/domains/plan-generation/core/application/services/*.ts` | LLM 호출 없는 새 유스케이스(기존 "저장" 로직 재사용) |
| (변경 없음) `apps/api/nestjs/csc-marketing/src/domains/video-project/**` | 그대로 재사용 |
| (변경 없음) `apps/api/fastapi/video-model/app/**` | 그대로 재사용 |

---

## 5. 검증 시나리오

1. 세그먼트 4개(장면구성만, 대사 없음) 입력 → 저장 → LLM 호출이 0회인지 로그로 확인(`language-model` 서비스에
   요청이 안 감).
2. 저장된 `marketing_saved_plans.scenes`의 `visualPrompt`/`dialogue`가 입력한 문자열과 **바이트 단위로 동일**한지 확인.
3. 영상 프로젝트 생성 → 렌더 → 세그먼트별 클립이 실제로 입력한 장면 구성대로 나오는지(수동 확인, AI 생성물이라
   결정론적이진 않지만 프롬프트 자체는 그대로 전달돼야 함).
4. `durationSec` 미지정 시 자동 추정값이 Veo 3 허용치(4/6/8초, 최대 8초)로 정상 clamp 되는지.
5. `durationSec` 15초처럼 허용 범위 밖 지정 시 에러 없이 8초로 clamp 되는지(혹은 명시적으로
   400 처리할지 3.5 결정과 함께 확정).
6. 세그먼트 연결 방식 "병렬"로 4개 세그먼트 생성 시 실제로 동시에 렌더 잡이 도는지.

---

## 6. 참고: 이번 조사에서 이미 확인된 관련 사실

- **영상 생성 provider = Google Veo 3**(`veo-3.1-generate-preview`, Gemini API). 어댑터는 이미 구현되어
  있음: `apps/api/fastapi/video-model/app/domains/video/adapters/outbound/processing/gemini_veo_video.py`.
  `durationSeconds` 허용값은 **4/6/8초, 최대 8초**이고 미달 시 올림 처리된다(`_pick_duration`).
- `language-model` 서비스는 dev 기본값이 `INFERENCE_ENGINE=stub`(에코, 실제 LLM 미호출) — verbatim 모드는
  애초에 이 서비스를 호출하지 않으므로 이 이슈와 무관해진다(오히려 verbatim 모드가 이 문제를 우회하는
  효과도 있음).
- Veo 3(Gemini API) 키는 조직별로 등록해야 하며(그룹웨어 조직관리 화면), dev 환경엔 현재 등록된 키가
  없어 실제 렌더까지는 별도 설정이 필요하다.
- (참고) 같은 video-model 서버에 Higgsfield 어댑터(`higgsfield_video.py`, 5/10초 열거값)도 존재하지만,
  이번 요구사항은 Veo 3로 확정되었으므로 이 스펙에서는 다루지 않는다.
