// 마케팅 도메인 테이블: 채널과 그 설정, 에셋, 기획/영상 산출물. csc-marketing 서버 단독 소유
// 목적 키워드는 저장하지 않는다. 기획서를 만들 때마다 새로 고르고 그 요청에 실어 보낸다.
import { sagaTable } from '@csc/saga/drizzle';
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * 채널: 블로그/유튜브/네이버 등 마케팅 채널 단위로 작업을 나눠 담는 사용자 정의 그룹
 * 사람마다 자기 채널을 갖는다(조직 공유가 아니다). 채널이 개인 것이라 그 안에 담기는 것도 전부 그 사람 것
 * (organization_id, owner_user_id, name) 유니크: 같은 사람 안에서만 이름 중복 방지
 * 조직 유니크면 남이 쓴 이름을 못 쓰는데 남의 목록은 보이지 않아 이유를 알 수 없음
 * URL 경로 식별자는 이름에서 파생(slugify)이라 별도 slug 컬럼 없음
 * sort_order 는 본인 목록의 표시 순서(드래그앤드롭 재정렬, 오름차순)
 * owner_user_id 는 조직유저 id(userdb). 크로스-DB FK 는 두지 않는다(DB 소유권 경계)
 */
export const marketingChannels = pgTable(
  'marketing_channels',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    ownerUserId: integer('owner_user_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ownerNameUq: unique('marketing_channels_owner_name_uq').on(
      t.organizationId,
      t.ownerUserId,
      t.name,
    ),
    // 목록 조회 = (조직, 소유자). 조직 단독 인덱스는 없음(그 스코프로 읽는 경로가 없다)
    orgOwnerIdx: index('marketing_channels_org_owner_idx').on(t.organizationId, t.ownerUserId),
  }),
);

/**
 * 채널 단위 설정(비밀값 아님): source_key 별 파라미터를 JSON 문자열로 담는 제네릭 KV
 * source_key 의 값 공간은 데이터 소스 key 가 아니라 설정 섹션 이름이다(섹션 추가 = key 하나 추가)
 * 소스 key 로 일괄 변환하는 마이그레이션을 돌리면 그 값까지 손상
 * 남아 있는 key 는 기획 프롬프트 지침 하나다(key="PLAN_PROMPT", settings={"instructions":"..."})
 * 나머지는 스코프가 채널이 아니라 떠났다(모델 선택과 브랜드/컨셉은 유저 설정, 수집 파라미터는 수집 서버)
 * (channel_id, source_key) 유니크: 채널의 key 당 1행. 채널 삭제 시 cascade
 */
export const marketingChannelSourceSettings = pgTable(
  'marketing_channel_source_settings',
  {
    id: serial('id').primaryKey(),
    channelId: integer('channel_id')
      .notNull()
      .references(() => marketingChannels.id, { onDelete: 'cascade' }),
    sourceKey: varchar('source_key', { length: 64 }).notNull(),
    settings: text('settings'),
    organizationId: integer('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelSourceUq: unique('marketing_channel_source_settings_channel_source_uq').on(
      t.channelId,
      t.sourceKey,
    ),
    channelIdx: index('marketing_channel_source_settings_channel_idx').on(t.channelId),
    orgIdx: index('marketing_channel_source_settings_org_idx').on(t.organizationId),
  }),
);

/**
 * 개인 도구 설정(유저당 1행): 모델 선택 + 브랜드/컨셉 세트(둘 다 버전별) + 진입 버전 + 먼저 열릴 채널
 * 채널이 아니라 유저에 매달린 이유: 무엇으로 어떻게 만들지는 만드는 사람의 선택이라, 채널을 옮겨도
 * 내 선택이 따라온다(채널 단위였을 때는 팀장이 정한 하나를 전원이 따랐고 채널 삭제가 세트까지 지웠다)
 * 두 JSON 컬럼은 값 하나가 아니라 버전 → 값 맵이다. v1.0 과 v1.5 는 별개 도구처럼 쓰여 모델도 연출도
 * 공유하지 않는다. 버전을 행으로 쪼개지 않은 이유: 한 사람의 설정을 한 번에 읽어야 하고, 버전이 늘어도
 * 마이그레이션 없이 맵에 키가 하나 는다(모델 역량도 같은 이유로 컬럼이 아니라 JSON 필드)
 * 두 설정을 한 컬럼에 합치지 않은 이유: 저장이 서로 독립이라(모델만 바꾸는 저장이 세트를 덮으면 안 된다)
 * 어댑터의 부분 upsert 경계와 컬럼 경계가 일치해야 함
 * version_mode(TS: entryVersion)는 진입 기본 버전일 뿐 "지금 보고 있는 버전" 이 아니다(그건 주소가 말한다)
 * 낡아도 산출물이 섞이지 않는 이유가 그것이다(default_channel_id 와 같은 개인 진입 취향)
 * owner_user_id 는 조직유저 id(userdb). 크로스-DB FK 는 두지 않는다(DB 소유권 경계)
 * (organization_id, owner_user_id) 유니크: 조직 안에서 유저당 1행
 */
export const marketingUserToolSettings = pgTable(
  'marketing_user_tool_settings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    ownerUserId: integer('owner_user_id').notNull(),
    // 버전 → 역량별 모델 id 맵(JSON 문자열). 없는 버전은 빈 선택으로 해석
    aiModels: text('ai_models'),
    // 버전 → 브랜드/컨셉 세트 맵(JSON 문자열). 세트 하나 = 브랜드명 + 설명 + 축별 선택(axis/option)
    // 선택지의 문구(label/note)는 저장하지 않는다. 카탈로그가 문구의 주인이라 읽을 때 채운다.
    // 브랜드명이 세트 식별자다(저장된 기획안의 brand_name 이 이 이름을 가리킨다)
    brandConcepts: text('brand_concepts'),
    // 진입 기본 버전(다음에 도구를 열 때 갈 곳). 값 공간은 ToolVersion 과 동일
    // 컬럼 이름 version_mode 는 옛 이름의 흔적이다(개명 마이그레이션을 아끼려 그대로 둔다)
    entryVersion: varchar('version_mode', { length: 16 }).notNull().default('v1.5'),
    // 도구에 들어왔을 때 먼저 열릴 채널. 무엇을 먼저 볼지는 각자의 작업 습관이라 본인만 설정
    // 크로스 테이블 FK 를 두지 않는다. 채널이 지워지면 값은 남지만 읽는 쪽이 목록에 없으면 첫 채널로
    // 접는다(고아 정리 잡보다 읽기 폴백이 단순하다)
    defaultChannelId: integer('default_channel_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgOwnerUq: unique('marketing_user_tool_settings_org_owner_uq').on(
      t.organizationId,
      t.ownerUserId,
    ),
  }),
);

/**
 * 인포그래픽(다형 유니온): jsonb 저장분. saved-plan 도메인 SavedPlanInfographic 과 동형
 * jsonb `$type` 캐스트라 형태 추가는 마이그레이션 없이 유니온 멤버 추가로 끝
 */
type SavedPlanInfographicJson =
  | { type: 'list'; title: string; items: string[] }
  | { type: 'table'; title: string; columns: string[]; rows: string[][] }
  | { type: 'bar'; title: string; unit?: string; bars: { label: string; value: number }[] }
  | {
      type: 'comparison';
      title: string;
      left: { heading: string; points: string[] };
      right: { heading: string; points: string[] };
    }
  | { type: 'steps'; title: string; steps: string[] }
  | { type: 'stat'; title: string; stats: { value: string; label: string }[] }
  | { type: 'timeline'; title: string; events: { time: string; label: string }[] };

/** 오디오 스냅샷(BGM): 선택 시점 assetId/uploadId/name(+미래 편집 볼륨) */
type AudioRefJson = { assetId: number; uploadId: string; name: string; volumePct?: number };
/** 씬 효과음 1개: 오디오 스냅샷 + 씬 시작 기준 offsetSec(초) */
type SceneSfxJson = AudioRefJson & { offsetSec: number };

/** 저장된 기획안의 씬(텍스트): file-upload 이미지는 sceneImages 로 분리 참조 */
type SavedPlanSceneJson = {
  index: number;
  // 소스 방향(연출 지시)과 하단 자막: 이미지→영상 버전만 채운다.
  // 선택인 이유는 sceneComposition 과 같다. 텍스트→영상 버전의 세그먼트에는 그 둘이 없는데
  // 빈 문자열은 "없다" 를 표현하기에 약해 읽는 쪽에서 실제로 오독이 났다.
  sourceDirection?: string;
  subtitle?: string;
  narration: string;
  // 씬 이미지 프롬프트(영어): 이미지 모델 전용
  imagePrompt?: string;
  // 장면 구성: 영상 모델이 그대로 읽는 문장(텍스트→영상 버전이 채운다)
  // 위 imagePrompt 와 다른 글이다(그쪽은 정지 이미지 브리프)
  sceneComposition?: string;
  // 대화내용: 이 동영상에서 말하는 문장
  // 화자는 소리를 누가 만드는가가 정한다. 렌더가 합성하지 않는 버전에서는 영상 모델이 화면 속
  // 인물의 입으로 낸다(아래 use_narration 이 정하지 않는다: 그 컬럼은 읽는 곳이 없다)
  dialogue?: string;
  infographic?: SavedPlanInfographicJson;
  // 씬 효과음 목록(0..N)
  sfx?: SceneSfxJson[];
};

/**
 * 씬 이미지 참조: file-upload uploadId(영구 식별자)만. 접근 URL 은 조회 시 BFF 가 재구성
 * prompt = 이 이미지를 만들 때 실제로 이미지 모델에 보낸 최종 프롬프트(작업자 확인용)
 */
type SavedPlanSceneImageJson = { index: number; uploadId: string; prompt?: string };

/**
 * 저장된 기획안(개인 워크스페이스): 작업자가 생성한 기획안을 영구 보관
 *   location='personal' + owner_user_id = 개인 워크스페이스(본인만 조회)
 *   location='archive'                  = 보관함(기획안 보관함은 화면에 없다. 서비스가 personal 만 다룬다)
 * 씬 텍스트는 JSONB, 씬 이미지는 file-upload uploadId 로 참조
 * 스토리지 계층: groupware/{orgId}/marketing-video/{personal/{userId} | archive}/{uploadId}
 */
export const marketingSavedPlans = pgTable(
  'marketing_saved_plans',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    // 소유 작업자(organization_users.id). location='personal' 이면 이 작업자 개인 워크스페이스
    ownerUserId: integer('owner_user_id').notNull(),
    // 'personal'(개인 워크스페이스) | 'archive'(보관함). 지금 이 표는 'personal' 전용
    location: varchar('location', { length: 16 }).notNull().default('personal'),
    // 원본 채널(스냅샷 맥락). 채널 삭제 시 저장본은 유지(참조만 null)
    channelId: integer('channel_id').references(() => marketingChannels.id, {
      onDelete: 'set null',
    }),
    brandName: varchar('brand_name', { length: 200 }).notNull().default(''),
    // 이 기획안을 만들 때 실제로 쓴 연출 축 조합(생성 시점 스냅샷)
    // 브랜드 이름만으로는 재현되지 않는다. 작업자가 세트를 시작점으로 삼아 축을 그 자리에서 바꿀 수
    // 있고 그 변경은 세트에 저장되지 않아, 이 값이 없으면 씬 이미지를 다시 만들 때 연출이 어긋남
    // null = 이 컬럼이 생기기 전 저장분(읽는 쪽이 세트 조회로 접는다)
    // 문구(label/note)는 담지 않는다. 카탈로그가 문구의 주인이라 읽을 때 채운다.
    brandConcepts: jsonb('brand_concepts').$type<{ axis: string; option: string }[]>(),
    title: varchar('title', { length: 300 }).notNull(),
    summary: text('summary').notNull().default(''),
    scenes: jsonb('scenes').$type<SavedPlanSceneJson[]>().notNull(),
    sceneImages: jsonb('scene_images').$type<SavedPlanSceneImageJson[]>().notNull(),
    // 기획안 전체 BGM(선택 시점 스냅샷): 후보 풀이 비어 미배정이면 null
    bgm: jsonb('bgm').$type<AudioRefJson>(),
    // 생성에 쓰인 AI 모델 스냅샷(정보 표시용): 저장 시점 채널 선택을 굳혀 이후 설정 변경과 독립
    // aiModelOptions 카탈로그 key(llm = 기획 LLM, image = 씬 이미지)
    llmModel: varchar('llm_model', { length: 100 }).notNull().default(''),
    imageModel: varchar('image_model', { length: 100 }).notNull().default(''),
    // 생성 시점에 고른 영상 모델. 위 둘과 성격이 다르다. 그쪽은 무엇으로 만들어졌는지 알리는
    // 정보이고 이 값은 나중에 영상을 만들 때 실제로 쓰이는 결정이다. 생성 모달에서 설정과 다른
    // 모델을 고를 수 있고 그 선택은 설정에 남지 않아, 저장하지 않으면 고른 것과 다른 모델이 쓰인다.
    // 빈 문자열 = 고른 적 없음(그때는 설정을 본다)
    videoModel: varchar('video_model', { length: 100 }).notNull().default(''),
    // 세그먼트(씬) 연결 방식: 렌더가 세그먼트를 동시에 만들지 순서대로 만들지
    // 영상 모델과 같은 이유로 저장한다. 빈 문자열 = 고른 적 없음 → 렌더 기본
    // 값은 렌더가 해석하는 문자열이라 DB 는 좁히지 않는다(방식이 늘어도 마이그레이션이 없다)
    segmentMode: varchar('segment_mode', { length: 32 }).notNull().default(''),
    // 나레이션 사용 여부. 읽는 곳도 쓰는 곳도 없음
    // 지금은 대사와 나레이션을 둘 다 영상 모델이 낸다. 이 스위치로 만든 기획안이 어느 규칙을
    // 따랐는지 남기려고 컬럼만 보존한다(지우려면 마이그레이션이라 별건)
    useNarration: boolean('use_narration').notNull().default(true),
    // 이 산출물이 속한 도구 버전. v1.0 과 v1.5 는 별개 워크스페이스라 목록이 섞이지 않음
    // 요청이 말한 버전을 생성 시점에 굳힌다. 보는 시점에 판정하면 버전을 바꾼 순간 이미 만든 것이
    // 어느 목록에도 없게 됨
    // NOT NULL 이고 DEFAULT 가 없다. 기본값을 두면 이 컬럼을 빠뜨린 INSERT 가 조용히 한쪽 버전 행을
    // 만들어 조이려던 목적이 무력화됨
    version: varchar('version_mode', { length: 16 }).notNull(),
    // 멱등키: 작업자의 한 번의 요청을 식별한다(클라이언트가 만든다). 쓰지 않는 경로와 옛 행은 null
    // 재시도와 더블클릭이 중복을 만들지 않게 하는 값이고 그 집행은 아래 부분 유니크
    // 키를 무엇으로 만드는지는 쓰기마다 다르다. 계약: docs/specs/marketing-write-consistency.md
    clientRequestId: varchar('client_request_id', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 멱등키 부분 유니크: 같은 요청의 재시도와 더블클릭이 두 행을 만드는 것 방지
    // null 은 서로 다르게 취급되므로 키를 쓰지 않는 경로와 옛 행은 통과
    clientRequestUq: uniqueIndex('marketing_saved_plans_client_request_uq')
      .on(t.organizationId, t.ownerUserId, t.clientRequestId)
      .where(sql`${t.clientRequestId} is not null`),
    // 개인 워크스페이스 조회 = (조직, 작업자, location, 채널). 선두 3개가 그대로라 기존
    // (org, owner, location) 질의도 이 인덱스 사용
    ownerChannelIdx: index('marketing_saved_plans_owner_channel_idx').on(
      t.organizationId,
      t.ownerUserId,
      t.location,
      t.channelId,
    ),
    // 기획안 보관함은 미구현이라(location 컬럼만 준비) 그쪽 인덱스는 없음
    // 질의가 없는 인덱스는 읽기에 쓰이지 않으면서 INSERT/UPDATE 마다 비용을 낸다.
  }),
);

/**
 * 영상 프로젝트 한 씬(조합 스펙): 저장 기획안 씬에서 파생한 편집 가능한 조합 단위
 *   imageUploadId = 씬 비주얼 소스, narration → TTS, subtitle = 화면 자막
 *   subtitle.style / durationSec / transition 은 미래 편집 자리(지금은 기본값 렌더)
 *   렌더러(video-model)가 이 스펙을 해석하므로 편집 UI 가 붙어도 필드만 채우면 끝
 */
type VideoProjectSceneJson = {
  order: number;
  imageUploadId: string;
  narration: string;
  subtitle: {
    text: string;
    style?: { font?: string; size?: number; position?: string; color?: string };
  };
  // 텍스트→영상 provider 에 보낼 화면 묘사. 기획안의 장면 구성(없으면 씬 이미지 프롬프트) 스냅샷
  visualPrompt?: string;
  // 이 동영상에서 말하는 문장(기획안 대화내용 스냅샷)
  // 화자는 렌더가 소리를 합성하는지가 정한다(잡 params 의 synthesize_speech). 합성하면 TTS 입력이고
  // 합성하지 않으면 영상 모델이 립싱크로 낼 대사다(use_narration 이 정하지 않는다)
  dialogue?: string;
  // null/미지정 = 나레이션(TTS) 길이 기반 자동. 미래 수동 오버라이드 자리
  durationSec?: number;
  // 다음 씬으로의 전환(예: crossfade). 미래 편집 자리라 지금은 기본 전환
  transition?: string;
  // 씬 효과음 목록(0..N)
  sfx?: SceneSfxJson[];
};

/** 영상 프로젝트 배경 프레임(미래): 지금은 미사용(null). 형태가 정해지면 여기 채운다. */
type VideoProjectBackgroundJson = { type?: string; [k: string]: unknown };

/**
 * 만들어진 세그먼트 하나(= 씬 하나의 렌더 결과). 렌더가 보고한 값을 종료 시점에 굳힌 것
 * status 값 공간을 좁히지 않는 이유: 그 어휘가 렌더(video-model) 소유이기 때문
 */
type VideoProjectSegmentJson = {
  order: number;
  status: string;
  clipUploadId: string | null;
  durationSec: number | null;
  prompt: string | null;
};

/**
 * 영상 프로젝트: 저장 기획안을 스냅샷해 만든 편집 가능한 영상 조합 스펙 + 렌더 상태
 *   렌더 결과물은 video-model 소유(uploadId 참조), 편집 데이터는 여기
 *   생성 시점 모델 선택(video/tts)을 스냅샷해 이후 설정 변경과 독립. 재렌더 = 이 스펙으로 새 잡
 *   렌더 상태: PENDING(등록) → RENDERING → COMPLETED/FAILED. renderJobId = video-model 잡 id
 */
export const marketingVideoProjects = pgTable(
  'marketing_video_projects',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    // 소유 작업자(organization_users.id): 개인 워크스페이스 격리
    ownerUserId: integer('owner_user_id').notNull(),
    // 원본 채널(모델 스냅샷 맥락). 채널 삭제 시 프로젝트는 유지(참조만 null)
    channelId: integer('channel_id').references(() => marketingChannels.id, {
      onDelete: 'set null',
    }),
    // 소스 저장 기획안. 저장본 삭제 시 프로젝트는 스냅샷이라 유지(참조만 null)
    savedPlanId: integer('saved_plan_id').references(() => marketingSavedPlans.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 300 }).notNull(),
    // 화면비: 쇼츠 기본 9:16. 미래 편집 자리
    aspectRatio: varchar('aspect_ratio', { length: 16 }).notNull().default('9:16'),
    // 원천 영상 화질: 만들기 시점 선택 스냅샷. aspectRatio/videoModel 과 같은 이유로 저장
    // (재렌더가 원본과 같은 결과를 내야 하는데 저장하지 않으면 조용히 기본값으로 바뀐다)
    // video-model 이 (화질 × 화면비) → 픽셀로 해석한다. 모델이 조정을 지원하지 않으면 항상 기본값
    resolution: varchar('resolution', { length: 16 }).notNull().default('720p'),
    // 생성 시점 AI 모델 선택 스냅샷. 빈 값 = 기본(slideshow/edge-tts)
    videoModel: varchar('video_model', { length: 100 }).notNull().default(''),
    videoMode: varchar('video_mode', { length: 20 }).notNull().default(''),
    // 세그먼트(씬) 연결 방식: 렌더가 세그먼트를 동시에 만들지 순서대로 만들지
    // 여기 있어야 렌더에 도달한다. 벤더로 나가는 스펙은 이 행에서 조립되므로(buildSpecFromRow)
    // 기획안에만 두면 잡 params 에 실리지 않음. 재렌더도 이 값을 다시 사용
    segmentMode: varchar('segment_mode', { length: 32 }).notNull().default(''),
    // 읽는 곳도 쓰는 곳도 없다(위 saved_plans 의 같은 컬럼 참고)
    useNarration: boolean('use_narration').notNull().default(true),
    ttsModel: varchar('tts_model', { length: 100 }).notNull().default(''),
    ttsVoice: varchar('tts_voice', { length: 100 }).notNull().default(''),
    ttsPitch: varchar('tts_pitch', { length: 20 }).notNull().default(''),
    scenes: jsonb('scenes').$type<VideoProjectSceneJson[]>().notNull(),
    // 배경 프레임(미래): 지금은 null. jsonb 라 채워도 마이그레이션 불필요
    background: jsonb('background').$type<VideoProjectBackgroundJson>(),
    // 기획안 전체 BGM(선택 시점 스냅샷): 렌더가 전체에 깐다.
    bgm: jsonb('bgm').$type<AudioRefJson>(),
    // 이 산출물이 속한 도구 버전. v1.0 과 v1.5 는 별개 워크스페이스라 목록이 섞이지 않음
    // 요청이 말한 버전을 생성 시점에 굳힌다. 보는 시점에 판정하면 버전을 바꾼 순간 이미 만든 것이
    // 어느 목록에도 없게 됨
    // NOT NULL 이고 DEFAULT 가 없다. 기본값을 두면 이 컬럼을 빠뜨린 INSERT 가 조용히 한쪽 버전 행을
    // 만들어 조이려던 목적이 무력화됨
    version: varchar('version_mode', { length: 16 }).notNull(),
    renderJobId: varchar('render_job_id', { length: 64 }),
    // 렌더 상태: video-model 잡을 폴링해 반영
    renderStatus: varchar('render_status', { length: 16 }).notNull().default('PENDING'),
    // 완성 영상의 file-upload uploadId(접근 URL 은 조회 시 BFF 가 재구성)
    resultUploadId: varchar('result_upload_id', { length: 200 }),
    // 대표 썸네일(file-upload uploadId). 없으면 null
    // 사람이 생성 결과 화면에서 고른 프레임에 문구를 얹은 PNG 다. 매번 영상에서 프레임을 떠서 만들면
    // 그 사람이 고른 프레임과 문구가 남지 않아 별개 자산으로 붙인다.
    // 카드의 그림은 이 값이 있으면 이것을, 없으면 첫 씬 이미지를 쓴다. 씬 이미지를 만들지 않는
    // 버전에서는 이 값이 그 카드의 유일한 그림
    thumbnailUploadId: varchar('thumbnail_upload_id', { length: 200 }),
    // 작업 공간에 배치된 시각. 아직이면 null
    // 만들어진 것과 사람이 자기 것으로 확정한 것을 가르는 값. 생성 창이 마지막 단계에서 기록
    // 확정 단계가 없는 버전은 이 값을 보지 않아 기본값도 두지 않는다(그 버전에는 없는 것과 같다)
    placedAt: timestamp('placed_at', { withTimezone: true }),
    // 'personal'(개인 작업 공간) | 'archive'(보관함). 다른 두 산출물 표와 같은 축
    // `placedAt` 과 다른 것을 말한다. 배치는 자기 것으로 확정했는가이고 이 값은 지금 어디 있는가다.
    // (보관물은 둘 다 갖는다. 배치되지 않은 행은 어느 목록에도 없어 보관함으로 보낼 방법이 없다)
    // 이 컬럼이 여기 있는 이유: 원천과 최종을 가르지 않는 버전에서는 이 표의 행이 곧 완성본이라
    // 보관함에 담길 물건도 이 표에 있다(최종 표에 사본을 만들면 한 영상이 두 표에 생긴다)
    location: varchar('location', { length: 16 }).notNull().default('personal'),
    // 시간동기 자막 트랙(JSON) file-upload id: COMPOSE 완료 시 기록, FINALIZE 가 fetch 해 번인
    captionsUploadId: varchar('captions_upload_id', { length: 200 }),
    // 만들어진 세그먼트 목록(씬별 클립). 렌더 종료 시점에 굳힌다.
    // 저장하는 이유: 렌더 상태 재조정은 비종료 행만 렌더에 물어본다. 완료 뒤에는 묻지 않으므로 여기
    // 두지 않으면 완성된 영상의 세그먼트 격자와 '이 칸만 다시 만들기' 가 통째로 사라진다.
    // (진행률과 렌더 구간은 끝난 뒤 의미가 없어 저장하지 않는다)
    segments: jsonb('segments').$type<VideoProjectSegmentJson[]>(),
    error: text('error'),
    // 실패 사유 코드. 값 공간은 렌더(video-model)가 소유하고 여기서는 통과만 시킨다
    // error 가 사람 문장이라 화면이 그것으로 한도와 크레딧을 가르면 벤더 문구가 바뀌는 날 어긋난다
    errorCode: varchar('error_code', { length: 40 }),
    // 멱등키: 작업자의 한 번의 요청을 식별한다(클라이언트가 만든다). 쓰지 않는 경로와 옛 행은 null
    // 재시도와 더블클릭이 중복을 만들지 않게 하는 값이고 그 집행은 아래 부분 유니크
    // 계약: docs/specs/marketing-write-consistency.md
    clientRequestId: varchar('client_request_id', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 멱등키 부분 유니크: 같은 요청의 재시도와 더블클릭이 두 행을 만드는 것 방지
    // null 은 서로 다르게 취급되므로 키를 쓰지 않는 경로와 옛 행은 통과
    clientRequestUq: uniqueIndex('marketing_video_projects_client_request_uq')
      .on(t.organizationId, t.ownerUserId, t.clientRequestId)
      .where(sql`${t.clientRequestId} is not null`),
    // 개인 워크스페이스 조회 = (조직, 작업자, location, 채널). 보관함으로 옮긴 항목이 워크스페이스에서
    // 사라져야 해서 개인 목록 질의에 location='personal' 이 들어가고 컬럼 순서도 거기에 맞춘다.
    ownerChannelIdx: index('marketing_video_projects_owner_channel_idx').on(
      t.organizationId,
      t.ownerUserId,
      t.location,
      t.channelId,
    ),
    // 보관함 조회 = (조직, location='archive', 버전). 조직 공용이라 작업자도 채널도 조건 아님
    // 위 개인 인덱스는 작업자가 두 번째 컬럼이라 이 질의를 받지 못함
    orgLocationVersionIdx: index('marketing_video_projects_org_location_version_idx').on(
      t.organizationId,
      t.location,
      t.version,
    ),
  }),
);

/**
 * 최종 영상 오버레이 스펙(스튜디오 편집 대상): 상단 제목 + 하단 자막의 텍스트와 스타일
 * 내용(자막 트랙)은 원천에서 오고 여기엔 표현과 제목 텍스트만 담는다. 스타일만 바꿔 재렌더하면
 * 재합성 없이 반영된다. csc-marketing shared/domain/overlay.ts(FinalOverlays) 미러
 */
type TextOverlayStyleJson = {
  fontUploadId?: string | null;
  fontKey?: string;
  sizePct?: number;
  color?: string;
  // 구역 뒷배경 직사각형(밴드): 기하는 캔버스 대비 %(완성 영상에서 리사이즈). null = 배경 없음
  band?: {
    color?: string;
    opacityPct?: number;
    xPct?: number;
    yPct?: number;
    widthPct?: number;
    heightPct?: number;
  } | null;
};
type FinalOverlaysJson = {
  title: { text: string; style: TextOverlayStyleJson };
  subtitle: { style: TextOverlayStyleJson };
};
/**
 * 세트 구역별 오버레이 스타일(제목/자막): 세트를 적용해 최종을 만들 때 FinalOverlays 로 확장
 * (제목 텍스트는 원천 제목). csc-marketing shared/domain/overlay.ts(SetOverlayStyles) 미러
 */
type SetOverlaysJson = {
  title: TextOverlayStyleJson;
  subtitle: TextOverlayStyleJson;
};

/**
 * 최종 영상: 원천 영상에 세트(배경프레임 + 아웃트로)를 입힌 배포용 파생본(원천 1:N 최종)
 *   원천과 세트 삭제와 무관하게 스냅샷으로 보존한다(frame/outro uploadId)
 *   합성 = video-model FINALIZE 잡이고 결과물은 video-model 소유. 상태는 원천 표와 동형으로 폴링해 반영
 *   location='personal' + owner_user_id = 개인 워크스페이스(본인만 조회)
 *   location='archive' = 보관함. 조직 공용이라 조회가 (조직, 버전)으로 나가 누가 만든 것이든 보인다.
 *     채널로는 나누지 않음. 채널이 개인 소유라 남의 채널 id 로는 아무도 걸러낼 수 없기 때문
 *     개인 축(작업자, 채널)은 location='personal' 에만 적용
 */
export const marketingVideoFinals = pgTable(
  'marketing_video_finals',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    // 소유 작업자(organization_users.id): 개인 워크스페이스 격리
    // 보관함으로 옮겨도 비우지 않음. 공용 보관함에서 누가 만들었는지를 말해 주는 유일한 값
    // 꺼내기는 이 값을 꺼낸 사람으로 바꾼다(남이 만든 것도 꺼낸 내 워크스페이스에 들어와야 보인다)
    ownerUserId: integer('owner_user_id').notNull(),
    // 'personal'(개인 워크스페이스) | 'archive'(보관함). marketing_saved_plans 와 같은 축
    location: varchar('location', { length: 16 }).notNull().default('personal'),
    // 원천 채널(스냅샷). 개인 워크스페이스는 채널별로 분리되므로 최종도 같은 축으로 나뉜다.
    // 조인이 아니라 컬럼으로 굳히는 이유: 원천이 삭제되면 조인으로는 채널을 잃어 최종이 모든
    // 워크스페이스에서 사라진다(이 표는 원천 삭제와 무관하게 보존되는 설계다)
    channelId: integer('channel_id').references(() => marketingChannels.id, {
      onDelete: 'set null',
    }),
    // 원천 영상 프로젝트. 원천 삭제 시 최종은 유지(스냅샷, 참조만 null)
    parentSourceId: integer('parent_source_id').references(() => marketingVideoProjects.id, {
      onDelete: 'set null',
    }),
    // 적용 세트 슬롯 스냅샷(file-upload uploadId): 세트 변경/삭제와 무관하게 보존
    frameUploadId: varchar('frame_upload_id', { length: 200 }),
    outroUploadId: varchar('outro_upload_id', { length: 200 }),
    title: varchar('title', { length: 300 }).notNull(),
    // 화면비 = 원천 스냅샷(실제 캔버스는 합성 시 프레임 비율로 결정)
    //   아래 default 는 쓰이지 않는다: 생성 경로가 늘 원천의 값을 명시해 넣는다(그래야 최종이
    //   원천과 같은 모양으로 합성된다). 화면비 SSOT 는 `@csc/video-capabilities` 다
    aspectRatio: varchar('aspect_ratio', { length: 16 }).notNull().default('1:1'),
    // 렌더 상태: video-model FINALIZE 잡을 폴링해 반영
    renderJobId: varchar('render_job_id', { length: 64 }),
    renderStatus: varchar('render_status', { length: 16 }).notNull().default('PENDING'),
    // 제목/자막 오버레이 스펙(스튜디오 편집): 스타일만 바꿔 재렌더하면 재합성 없이 반영. jsonb 라 무마이그레이션
    overlays: jsonb('overlays').$type<FinalOverlaysJson>(),
    // 완성 최종 영상의 file-upload uploadId(접근 URL 은 조회 시 BFF 재구성)
    resultUploadId: varchar('result_upload_id', { length: 200 }),
    error: text('error'),
    // 만들 때의 도구 버전(스냅샷). v1.0 과 v1.5 는 별개 도구처럼 쓰이므로 최종 영상도 섞이지 않는다:
    // 워크스페이스 '최종 영상' 탭과 보관함 둘 다 보는 사람의 현재 버전 것만 표시
    //
    // 보관함만 가르지 않고 생성 시점에 굳히는 이유: 보관 시점에 태그하면 한 버전에서 보관한 영상이
    // 다른 버전에서는 워크스페이스에도(보관됨) 보관함에도(버전 불일치) 없어 접근 경로가 사라진다.
    //
    // NOT NULL 이고 DEFAULT 가 없다. 기본값을 두면 이 컬럼을 빠뜨린 INSERT 가 조용히 한쪽 버전
    // 행을 만들어 조이려던 목적이 무력화됨. 값은 반드시 요청에서 와야 함
    version: varchar('version_mode', { length: 16 }).notNull(),
    // 멱등키: 작업자의 한 번의 요청을 식별한다(클라이언트가 만든다). 쓰지 않는 경로와 이 컬럼이
    // 생기기 전 행은 null.
    //
    // 재시도와 더블클릭이 중복을 만들지 않게 하는 값이다. (organization_id, owner_user_id,
    // client_request_id) 부분 유니크가 그것을 막는다. 부분인 이유는 null 이 유니크에서 서로 다르게
    // 취급되어 옛 행과 키 없는 경로를 막지 않기 때문
    //
    // 키를 무엇으로 만드는지는 쓰기마다 다르다(같은 기획안을 두 번 만드는 것이 정상인 쓰기도 있다)
    // 계약: docs/specs/marketing-write-consistency.md
    clientRequestId: varchar('client_request_id', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 멱등키 부분 유니크: 같은 요청의 재시도와 더블클릭이 두 행을 만드는 것 방지
    //   null 은 서로 다르게 취급되므로 키를 쓰지 않는 경로와 옛 행은 통과
    clientRequestUq: uniqueIndex('marketing_video_finals_client_request_uq')
      .on(t.organizationId, t.ownerUserId, t.clientRequestId)
      .where(sql`${t.clientRequestId} is not null`),
    // 개인 워크스페이스 조회 = (조직, 작업자, location, 채널). 보관함으로 옮긴 항목이 워크스페이스에서
    // 사라져야 해서 개인 목록 질의에 location='personal' 이 들어가고 컬럼 순서도 거기에 맞춘다.
    // 버전은 넣지 않는다. nullable 이라 조건이 (IS NULL OR =) 이고 채널까지로 이미 충분히 좁혀진다.
    ownerChannelIdx: index('marketing_video_finals_owner_channel_idx').on(
      t.organizationId,
      t.ownerUserId,
      t.location,
      t.channelId,
    ),
    // 보관함 조회 = (조직, location='archive', 버전). 조직 공용이라 작업자도 채널도 조건 아님
    // 위 개인 인덱스는 작업자가 두 번째 컬럼이라 이 질의를 받지 못함
    orgLocationVersionIdx: index('marketing_video_finals_org_location_version_idx').on(
      t.organizationId,
      t.location,
      t.version,
    ),
  }),
);

/**
 * 플랫폼 공통 에셋(AI 자동 삽입 풀): 전 조직의 마케팅영상 도구에서 재사용할 BGM/효과음/샘플이미지
 * 플랫폼이 control-tower 에서 업로드해 '공통' 라벨로 노출
 * 바이트는 file-upload(uploadId 참조)이고 접근 URL 은 조회 시 BFF 가 재구성한다(씬 이미지와 동형)
 *   category ∈ { BGM, SFX, SAMPLE_IMAGE }(코드 SSOT CommonAssetCategory 와 1:1)
 *   배경프레임과 아웃트로는 여기 없음. 세트가 자기완결로 직접 소유
 *   scope='common' = 전 조직 공유. 조직별 에셋은 scope='organization' + organization_id 로 가산
 */
export const marketingCommonAssets = pgTable(
  'marketing_common_assets',
  {
    id: serial('id').primaryKey(),
    category: varchar('category', { length: 32 }).notNull(),
    // 'common'(전 조직) | 'organization'(조직 소유) | 'pack'(플러그인 팩, 활성화 조직만 노출)
    scope: varchar('scope', { length: 16 }).notNull().default('common'),
    // scope='organization' 이면 소유 조직 id. common/pack 은 null.
    organizationId: integer('organization_id'),
    // file-upload 영구 식별자. 접근 URL 은 조회 시 재구성(스토리지 비종속)
    uploadId: varchar('upload_id', { length: 200 }).notNull(),
    // 표시명: 운영자/조직원에게 보이는 이름
    name: varchar('name', { length: 300 }).notNull(),
    // audio/* vs image/* vs video/* 구분(뷰 렌더/영상 합성)
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    sizeBytes: integer('size_bytes'),
    // 플러그인 팩 소속: scope='pack' 일 때 팩 카탈로그(marketing_asset_packs) 참조. common/organization 이면 null.
    packId: integer('pack_id').references(() => marketingAssetPacks.id, {
      onDelete: 'cascade',
    }),
    // 카테고리 내 표시 순서(오름차순). 미래 드래그 재정렬 자리
    sortOrder: integer('sort_order').notNull().default(0),
    // 감사: 업로드한 플랫폼 관리자(admin_users.id). 조직 스코프 아님
    createdByAdminId: integer('created_by_admin_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 조회 = scope+category 필터 후 sort_order 정렬
    scopeCategoryIdx: index('marketing_common_assets_scope_category_idx').on(
      t.scope,
      t.category,
      t.sortOrder,
    ),
  }),
);

/**
 * 에셋 세트: 배경프레임(이미지) + 아웃트로(mp4)를 묶은 자기완결 단위(그 두 슬롯만)
 * 세트가 두 바이트를 uploadId 로 직접 소유한다(별도 풀이나 멤버 테이블 없음)
 * 영상 제작 마지막에 사용자가 수동 선택하므로 태그와 라벨 없음
 * scope='common' = 플랫폼 공통 세트. 조직 세트는 scope='organization' + organization_id 로 가산
 * 슬롯 확장은 컬럼 추가로, 다슬롯화가 필요해지면 role 기반 멤버 테이블로 승격
 */
export const marketingAssetSets = pgTable(
  'marketing_asset_sets',
  {
    id: serial('id').primaryKey(),
    // 'common'(전 조직) | 'organization'(조직 소유) | 'pack'(플러그인 팩, 활성화 조직만 노출)
    scope: varchar('scope', { length: 16 }).notNull().default('common'),
    // scope='organization' 이면 소유 조직 id. common/pack 은 null.
    organizationId: integer('organization_id'),
    // 플러그인 팩 소속: scope='pack' 일 때 marketing_asset_packs 참조. 그 외 null.
    packId: integer('pack_id').references(() => marketingAssetPacks.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 300 }).notNull(),
    // 배경프레임(이미지) file-upload uploadId: 없으면 null. 접근 URL 은 조회 시 재구성
    frameUploadId: varchar('frame_upload_id', { length: 200 }),
    // 아웃트로(mp4 영상) file-upload uploadId: 없으면 null.
    outroUploadId: varchar('outro_upload_id', { length: 200 }),
    // 구역별 오버레이 스타일(제목/자막 배경색+폰트): 최종 생성 시 이 스타일로 번인. null=미설정(구 세트)→기본값. jsonb 라 무마이그레이션
    overlays: jsonb('overlays').$type<SetOverlaysJson>(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByAdminId: integer('created_by_admin_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeSortIdx: index('marketing_asset_sets_scope_sort_idx').on(t.scope, t.sortOrder),
  }),
);

/**
 * 태그 축 카탈로그: 자산 카테고리별 태그 축(분위기, 템포, 장르, 용도 등)
 * 축은 DB 가 단일 진실원이고 플랫폼이 런타임 CRUD 한다(프론트 상수 대체)
 *   category 는 코드 SSOT(CommonAssetCategory)와 1:1, (category, key) 유니크로 축 key 중복 방지
 *   is_active=false 는 소프트 비활성(행과 기존 태깅 보존). 부팅 재동기화는 없고 시드는 1회 마이그레이션
 */
export const marketingAssetAxes = pgTable(
  'marketing_asset_axes',
  {
    id: serial('id').primaryKey(),
    // 'common'(플랫폼 전역) | 'organization'(조직 전용, 그 조직만 노출/편집)
    scope: varchar('scope', { length: 16 }).notNull().default('common'),
    // scope='organization' 이면 소유 조직 id. common 은 null.
    organizationId: integer('organization_id'),
    category: varchar('category', { length: 32 }).notNull(),
    key: varchar('key', { length: 40 }).notNull(),
    label: varchar('label', { length: 100 }).notNull(),
    hint: varchar('hint', { length: 200 }).notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 공통: (category,key) 유일. 조직: (category,key,org) 유일: 부분 유니크로 스코프별 분리
    commonKeyUq: uniqueIndex('marketing_asset_axes_common_key_uq')
      .on(t.category, t.key)
      .where(sql`${t.organizationId} is null`),
    orgKeyUq: uniqueIndex('marketing_asset_axes_org_key_uq')
      .on(t.category, t.key, t.organizationId)
      .where(sql`${t.organizationId} is not null`),
    categoryIdx: index('marketing_asset_axes_category_idx').on(t.category, t.sortOrder),
    orgIdx: index('marketing_asset_axes_org_idx').on(t.organizationId),
  }),
);

/**
 * 태그 값 카탈로그: 각 축의 통제 어휘(선택지). 조직 태깅은 이 목록에서만 고른다(자유입력 없음)
 *   value = 저장과 매칭의 안정값, label = 표시명. (axis_id, value) 유니크, 축 삭제 시 cascade
 */
export const marketingAssetTags = pgTable(
  'marketing_asset_tags',
  {
    id: serial('id').primaryKey(),
    axisId: integer('axis_id')
      .notNull()
      .references(() => marketingAssetAxes.id, { onDelete: 'cascade' }),
    // 'common'(플랫폼) | 'organization'(조직 전용). 조직 태그는 공통 축이나 자기 조직 축 아래에 부착 가능
    scope: varchar('scope', { length: 16 }).notNull().default('common'),
    // scope='organization' 이면 소유 조직 id. common 은 null.
    organizationId: integer('organization_id'),
    value: varchar('value', { length: 60 }).notNull(),
    label: varchar('label', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 공통: (axis,value) 유일. 조직: (axis,value,org) 유일이라 조직마다 같은 value 를 자기 태그로 보유 가능
    commonValueUq: uniqueIndex('marketing_asset_tags_common_value_uq')
      .on(t.axisId, t.value)
      .where(sql`${t.organizationId} is null`),
    orgValueUq: uniqueIndex('marketing_asset_tags_org_value_uq')
      .on(t.axisId, t.value, t.organizationId)
      .where(sql`${t.organizationId} is not null`),
    axisIdx: index('marketing_asset_tags_axis_idx').on(t.axisId, t.sortOrder),
    orgIdx: index('marketing_asset_tags_org_idx').on(t.organizationId),
  }),
);

/**
 * 자산 ↔ 태그 링크(관계형 태깅)
 * (common_asset_id, tag_id) 복합 PK 로 중복 방지, 양쪽 cascade. tag_id 인덱스가 "태그 X 자산" 역질의 담당
 */
export const marketingCommonAssetTags = pgTable(
  'marketing_common_asset_tags',
  {
    commonAssetId: integer('common_asset_id')
      .notNull()
      .references(() => marketingCommonAssets.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => marketingAssetTags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commonAssetId, t.tagId] }),
    tagIdx: index('marketing_common_asset_tags_tag_idx').on(t.tagId),
  }),
);

/**
 * 플러그인 팩(플랫폼 콘텐츠): BGM/효과음/세트 묶음을 공통(전 조직 자동)과 별개로 제공
 * 조직이 활성화(부여 또는 opt-in)한 팩의 자산만 그 조직에 노출된다(엔타이틀먼트 catalog 와 동형)
 *   콘텐츠라 코드 key 가 없다(DB-authored, id 식별). status=PUBLISHED 만 노출과 활성화 대상
 *   지금은 스키마와 조회 seam 만 있고 생성/발행/부여 UI 는 없음
 */
export const marketingAssetPacks = pgTable('marketing_asset_packs', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 300 }).notNull(),
  description: text('description').notNull().default(''),
  status: varchar('status', { length: 16 }).notNull().default('DRAFT'), // DRAFT | PUBLISHED
  sortOrder: integer('sort_order').notNull().default(0),
  createdByAdminId: integer('created_by_admin_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 조직 팩 활성화(부여와 opt-in 공용): organization_ai_tools 와 동형
 *   source='GRANT'(플랫폼이 부여) | 'OPTIN'(조직이 스스로 활성화). 조회는 존재만 확인
 * (organization_id, pack_id) 복합 PK, 팩 삭제 시 cascade
 */
export const marketingOrganizationAssetPacks = pgTable(
  'marketing_organization_asset_packs',
  {
    organizationId: integer('organization_id').notNull(),
    packId: integer('pack_id')
      .notNull()
      .references(() => marketingAssetPacks.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 8 }).notNull().default('GRANT'), // GRANT | OPTIN
    grantedByAdminId: integer('granted_by_admin_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.packId] }),
    orgIdx: index('marketing_organization_asset_packs_org_idx').on(t.organizationId),
  }),
);

/**
 * 사가 진행 상태(다단계 쓰기 오케스트레이션). 정의는 공유 엔진이 갖는다(@csc/saga/drizzle)
 * 표를 손으로 적지 않는 이유: 러너의 의미가 컬럼에 걸려 있어(step+context = 재개 지점,
 * claimed_at = 실행권, 부분 유니크 = 멱등키 하나) 앱마다 다시 적으면 그중 하나가 조용히 빠진다.
 * 마이그레이션은 이 DB 를 소유한 쪽이 생성한다(0055_saga_instances)
 */
export const marketingSagas = sagaTable('marketing_sagas');
