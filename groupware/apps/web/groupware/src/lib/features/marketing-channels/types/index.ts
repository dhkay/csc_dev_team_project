// 채널관리(마케팅 영상) 도메인 타입: 채널 + 기획/영상 산출물

/** 채널: 블로그/유튜브/네이버 등 마케팅 채널 단위 그룹. URL 식별자는 이름에서 파생(slugify) */
export interface Channel {
  id: number;
  name: string;
}

// 기본 축 목록의 주인은 백엔드 카탈로그다(brand-concept-catalog.types). 화면은 조회 응답을 그대로
// 그리고, 이 유니온은 저장 요청의 axis 를 좁히는 용도로만 둔다. 백엔드에서 축이 늘면 여기도 맞춘다.
// 기본 축이 전부는 아니다. 세트마다 카테고리를 더할 수 있고 그 key 는 `x:` 접두사를 가지므로,
// 축을 가리키는 자리의 타입은 이 유니온이 아니라 ConceptAxisRef 다
export type ConceptAxisKey =
  | 'style'
  | 'mood'
  | 'tone'
  | 'sound'
  | 'structure'
  | 'audience'
  | 'purpose';

/**
 * 세트가 스스로 더한 카테고리/레퍼런스의 key. `x:` 접두사라 기본 축 key 와 겹치지 않음
 * 템플릿 리터럴로 두는 이유: `string` 으로 넓히면 `'moodd'` 같은 오타도 통과하기 때문
 */
export type CustomConceptKey = `x:${string}`;

/** 축 참조: 기본 축 key 이거나 그 세트가 더한 카테고리 key */
export type ConceptAxisRef = ConceptAxisKey | CustomConceptKey;

/** 컨셉 한 축의 선택(저장되는 전부): 어느 축에서 어느 선택지를 골랐는가 */
export interface ConceptChoice {
  axis: ConceptAxisRef;
  option: string;
}

/** 선택 + 그 선택지의 현재 문구. 서버가 카탈로그(또는 그 세트의 커스텀 정의)에서 채워 반환 */
export interface ConceptSelection extends ConceptChoice {
  label: string;
  note: string;
  // 축 이름. 커스텀 카테고리 전용
  // 기본 축 이름은 카탈로그가 알지만 커스텀은 정의가 그 세트 안에만 있어 서버가 해석 시점에 주입
  axisLabel?: string;
}

/** 세트가 더한 카테고리(축) 하나. 이름을 바꿔도 key 가 그대로라 이미 고른 선택이 살아남음 */
export interface CustomConceptAxis {
  key: CustomConceptKey;
  label: string;
}

/**
 * 세트가 더한 레퍼런스(옵션) 하나
 * `axis` 가 기본 축 key 일 수도 있어 "기본 카테고리에 레퍼런스 추가" 와 "커스텀 카테고리의
 * 레퍼런스" 가 한 배열로 표현된다(화면에서도 같은 동작이다)
 */
export interface CustomConceptOption {
  axis: ConceptAxisRef;
  key: CustomConceptKey;
  label: string;
  description: string;
}

/** 카탈로그의 선택지 하나: 화면에 보이는 이름과 감독 노트가 그대로 프롬프트로 나감 */
export interface BrandConceptOption {
  key: string;
  label: string;
  description: string;
}

/** 카탈로그의 축 하나: 축 이름 + 그 축의 선택지 목록 */
export interface BrandConceptAxis {
  key: ConceptAxisKey;
  label: string;
  description: string;
  options: BrandConceptOption[];
}

/**
 * 한 사람의 브랜드/컨셉 한 세트: 브랜드명 + 설명 + 축별 컨셉 선택
 * 사람마다 여러 세트를 가지며 brandName 이 세트 식별자다.
 */
export interface BrandConceptSet {
  brandName: string;
  brandDescription: string;
  // 축별 선택 + 그 선택지의 현재 문구(서버가 카탈로그에서 채운다)
  concepts: ConceptSelection[];
  // 이 세트가 더한 카테고리와 레퍼런스. 카탈로그에 없는 축을 세트마다 보유 가능
  // 조회 응답에는 항상 온다(없으면 빈 배열). 읽는 쪽이 없음을 다루지 않게 서버가 채운다.
  customAxes: CustomConceptAxis[];
  customOptions: CustomConceptOption[];
}

/** 저장 요청의 한 세트: 고른 것만 보낸다(문구는 서버가 카탈로그에서 채운다) */
export interface BrandConceptSetInput {
  brandName: string;
  brandDescription: string;
  concepts: ConceptChoice[];
  // 저장 요청에서는 생략 가능(커스텀을 쓰지 않는 세트). 서버가 빈 것으로 해석
  customAxes?: CustomConceptAxis[];
  customOptions?: CustomConceptOption[];
}

/**
 * 이미지 생성 엔진의 현재 부하: 자체 호스팅(공유 GPU)일 때의 큐 현황. 외부 벤더면 null
 * ComfyUI 는 dev/staging/prod 전체가 함께 쓰는 GPU 1장이라 내 대기 시간을 이 큐가 결정
 */
export interface ImageEngineLoad {
  running: number;
  pending: number;
}

/** 개인 AI 모델 선택: 역량별 모델 id(미선택이면 ''). id 는 aiModelOptions 카탈로그 key */
export interface AiModelSelection {
  llm: string;
  video: string;
  // 영상 생성 모드(자체 영상 모델의 t2v/i2v/ti2v). '' = 자동(소스 이미지 유무)
  videoMode: string;
  tts: string;
  // TTS 음성 id(edge-tts 등 tts 모델의 음성)
  ttsVoice: string;
  // TTS 피치(edge-tts pitch, 예: '+0Hz')
  ttsPitch: string;
  image: string;
}

// 수집된 인기 검색어의 형태(버킷/순위/상태)는 여기 없다. 화면이 그 원문을 받지 않기 때문
// 그 데이터는 키워드 후보의 재료로만 쓰이고 조립은 csc-marketing 안에서 종료

/**
 * 기획안 인포그래픽: type 판별 유니온. 해당 씬이 인포그래픽 씬일 때만
 * 백엔드 PlanInfographicEntity 와 동형. 구조화 데이터가 SSOT 라 정적 이미지 렌더와 후속 애니메이션
 * 렌더가 같은 데이터를 공유한다. 새 형태 추가 = 여기 멤버 + 렌더러 레지스트리
 */
export type InfographicType =
  | 'list'
  | 'table'
  | 'bar'
  | 'comparison'
  | 'steps'
  | 'stat'
  | 'timeline';

export type PlanInfographic =
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

/** 오디오 스냅샷(BGM): 백엔드 shared/domain/audio 와 동형. uploadId 로 재생 URL 재구성 */
export interface AudioRef {
  assetId: number;
  uploadId: string;
  name: string;
}

/** 씬 효과음 1개: 오디오 스냅샷 + 씬 시작 기준 재생 오프셋(초) */
export interface SceneSfx extends AudioRef {
  offsetSec: number;
}

/**
 * 기획안의 한 씬. 버전마다 채우는 필드가 다르다(서버의 도메인 엔티티와 같은 규칙)
 * 이미지→영상 버전은 연출과 자막과 이미지 브리프를, 텍스트→영상 버전은 장면 구성과 대화내용을
 * 채운다. 두 버전이 다 채우는 것은 `index` 와 `narration` 뿐
 * 없는 필드는 키 자체가 없음. 빈 문자열로 채우면 "없다" 가 유효한 값처럼 보여 읽는 쪽이 오독
 * 화면은 값의 유무로 두 형식을 가른다(버전 prop 을 나르지 않는다)
 */
export interface PlanScene {
  index: number;
  // 연출 지시: 한국어(상세 화면에 표시). 이미지→영상 버전만 채운다.
  sourceDirection?: string;
  // 하단 자막: 한국어(영상 결과물). 이미지→영상 버전만 채운다.
  subtitle?: string;
  // 나레이션: 한국어(영상 결과물). 두 버전 다 채운다.
  narration: string;
  // 씬 이미지 프롬프트: 이미지 모델 전용이라 화면에 미표시
  // (LLM 이 장면과 대사 의미, 브랜드 맥락을 한 덩어리로 접어넣은 시각 브리프)
  imagePrompt?: string;
  // 장면 구성: 영상 모델이 그대로 읽는 문장(텍스트→영상 버전). 화면에 표시
  // `imagePrompt` 와 달리 정지 이미지가 아니라 움직이는 한 컷 묘사
  sceneComposition?: string;
  // 대화내용: 화면 속 인물이 하는 말. 화면 밖에서 읽는 문장은 `narration` 이고 한 동영상은 둘 중
  // 하나만 갖는다(둘 다 온 응답은 서버 파서가 대화내용을 남긴다)
  dialogue?: string;
  infographic?: PlanInfographic;
  // 이 씬 효과음 목록(0..N): AI 가 고른 스냅샷 + 씬 시작 기준 offsetSec. 스튜디오 편집 대비 배열
  sfx?: SceneSfx[];
}

/**
 * 포커스 키워드 후보의 출처. 라벨이 곧 신뢰도다.
 * `collected` 는 사람들이 실제로 검색한 말, `generated` 는 모델이 지어낸 말, `edited` 는 작업자가
 * 고친 말. 구분하지 않으면 실측과 추정을 같은 무게로 고르게 됨
 * `edited` 는 화면에서만 생기고 서버로 가지 않는다(키워드 문자열만 보낸다)
 */
export type FocusKeywordOrigin = 'collected' | 'generated' | 'edited';

/** 키워드 검색 화면의 후보 한 건 */
export interface FocusKeywordCandidate {
  keyword: string;
  origin: FocusKeywordOrigin;
  // collected 일 때: 어느 소스에서 왔는가(배지에 표시)
  source?: { key: string; label: string };
  // 그 값을 주는 소스에서만. 고를 근거로 함께 표시
  monthlySearches?: number;
}

/**
 * 기획서 생성 1회의 요청: 위저드에서 고른 값 전부. 위저드 → 페이지 → 쿼리 → API 를 한 덩어리로 흐른다.
 * 생성 노브가 늘어도 필드 하나만 추가하면 되도록 묶어 둔다(위치 인자로 흩으면 경로의 시그니처가 전부 바뀐다)
 * 채널(channelId)은 위저드 선택이 아니라 URL 이 정하는 맥락이라 이 요청에서 제외
 */
export interface PlanGenerationRequest {
  // 선택한 브랜드/컨셉 세트. 빈 문자열이면 세트를 고르지 않은 경로(프롬프트 입력 방식)라
  // 주제도 연출도 `sceneBrief` 가 대신하고 적히지 않은 것은 모델이 결정
  brandName: string;
  // 이번 생성에 쓸 연출 축 조합. 세트를 시작점으로 삼아 작업자가 그 자리에서 바꾼 값
  // 세트에 저장하지 않음. 시도 하나가 설정에 남으면 원래 조합을 잃기 때문
  // 대신 쓴 조합은 기획안을 저장할 때 함께 저장
  concepts: ConceptChoice[];
  // 이번 생성의 목적 키워드(키워드 검색 화면에서 고른 것). 저장하지 않아 요청에 적재
  purposeKeywords: string[];
  proposalCount: number;
  sceneCount: number;
  excludeInfographic: boolean;
  // 작업자가 직접 적은 씬 구성이나 요구사항(선택). 비었으면 미전송
  // 브랜드와 컨셉이 "어떤 톤으로" 라면 이 값은 "무엇을 담을지" 를 사람이 직접 지시하는 자리다.
  // 공백만 적은 것은 적지 않은 것으로 본다(화면도 그렇게 센다)
  sceneBrief?: string;
  // 피해야 할 것을 직접 적은 제한사항(선택). `sceneBrief` 와 짝이고 공백 처리도 동일
  constraints?: string;
  // 이번 생성에 쓸 영상 모델 key(선택). 설정에 저장된 값과 같으면 미전송
  // 브랜드 축 조합과 같은 성격이라 저장본 스냅샷으로 함께 저장돼 나중에 영상을 만들 때 다시 쓰인다.
  videoModel?: string;
  // 세그먼트(씬) 연결 방식(선택). 세그먼트를 동시에 만들지 순서대로 만들지 결정
  // 값은 렌더가 해석하는 문자열이라 여기서는 좁히지 않음
  segmentMode?: string;
}

/**
 * 기획서 생성 결과
 * 배열이 아니라 봉투인 이유는 모델 이름 하나다. 저장이 "이 기획안을 무엇이 썼는가" 를 알아야 하고
 * 그것을 아는 것은 생성한 서버뿐이라, 화면이 그 값을 들고 있다가 저장에 반환
 */
export interface GeneratedPlans {
  proposals: PlanProposal[];
  // 이 생성이 실제로 부른 기획 LLM. 저장에 그대로 실어 보낸다.
  llmModel: string;
}

/** 기획안 1개: 아이디어(제목 + 한 줄 요약) + 씬 목록 */
export interface PlanProposal {
  id: string;
  title: string;
  summary: string;
  scenes: PlanScene[];
  // 기획안 전체 BGM(필수): AI 가 고른 스냅샷. 후보 풀이 비어 미배정이면 null(렌더 시 등록 차단)
  bgm: AudioRef | null;
}

/**
 * 한 씬 이미지의 생성 상태(휘발성: 저장 안 함)
 * 기획안 완성 = 텍스트 + 모든 씬 이미지(status='done'). loading→done/error 로 전이
 */
export interface SceneImageState {
  status: 'loading' | 'done' | 'error';
  // 완료 시 inline base64 data URL
  dataUrl?: string;
  // status='error' 시 실패 사유(예: 이미지 엔진 연결 실패). 상세에 표시
  error?: string;
  // 이 이미지를 만들 때 실제로 이미지 모델에 보낸 최종 프롬프트(백엔드 조립 결과)
  // 상세의 '프롬프트 보기' 가 그대로 표시. 모델을 거치지 않은 이미지에는 없음
  // (인포그래픽 캔버스 렌더, 작업자가 가져온 외부 이미지)
  prompt?: string;
}

/** 저장 요청용 씬 이미지 참조: DB 엔 uploadId 만 저장(URL 은 저장하지 않는다) */
export interface SavedSceneImageRef {
  index: number;
  uploadId: string;
  // 이 이미지를 만든 최종 프롬프트(생성 시점). 외부 이미지에는 없음
  prompt?: string;
}

/** 조회된 씬 이미지: BFF 가 uploadId 로 현재 공개 베이스에서 접근 URL 을 재구성해 채운다. */
export interface SavedSceneImage {
  index: number;
  uploadId: string;
  url: string;
  // 이 이미지를 만든 최종 프롬프트(생성 시점). 외부 이미지에는 없음
  prompt?: string;
}

/**
 * 저장된 기획안(개인 워크스페이스, DB 영구 저장본)
 * 씬 텍스트(scenes) + 씬 이미지 접근 URL(sceneImages)로 그리드와 상세를 렌더
 */
export interface SavedPlan {
  id: number;
  channelId: number | null;
  brandName: string;
  // 이 기획안을 만들 때 쓴 연출 축 조합(생성 시점 스냅샷). 씬 이미지를 다시 만들 때 이 값을 보내
  // 처음 만든 그림과 화풍을 잇는다. 빈 배열 = 세트 조합 그대로(또는 이 값이 생기기 전 저장본)
  brandConcepts: ConceptChoice[];
  title: string;
  summary: string;
  scenes: PlanScene[];
  sceneImages: SavedSceneImage[];
  // 기획안 전체 BGM(선택 시점 스냅샷). 없으면 null, 씬 효과음은 scenes[].sfx
  bgm: AudioRef | null;
  // 생성에 쓰인 AI 모델 스냅샷(정보 팝오버용): 저장 시점 채널 선택을 굳힌 값
  // llmModel = 기획 LLM, imageModel = 씬 이미지 모델. 채널 없이 저장했거나 구 저장본은 ''
  llmModel: string;
  imageModel: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 영상 렌더 상태: PENDING(등록) → RENDERING → COMPLETED/CANCELLED
 * csc-marketing 이 video-model 잡을 폴링해 반영한다(백엔드 render-status 커널과 어휘 일치)
 * STALLED = 비종료지만 소비 워커가 없어 정체. 계속 폴링하다 워커 복귀 시 자동 재개
 * CANCELLED = 생성이 불가해 되돌린 상태. 카드로 그리지 않고 사유를 알린 뒤 목록에서 걷어낸다.
 * FAILED = 그 규칙 이전 기록(레거시). 표시상 CANCELLED 와 같게 취급
 */
export type RenderStatus =
  | 'PENDING'
  | 'RENDERING'
  | 'STALLED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

/** 렌더 진행 중(비종료) 여부: 폴링 유지와 오버레이 판정의 단일 출처. STALLED 포함(자동 재개용) */
export function isRenderingStatus(status: RenderStatus): boolean {
  return status === 'PENDING' || status === 'RENDERING' || status === 'STALLED';
}

/**
 * 되돌려진 상태: 보여줄 산출물이 없다. 카드로 렌더하지 않고 사유를 한 번 알린 뒤 감춘다.
 * (백엔드 ROLLED_BACK_RENDER_STATUSES 와 어휘 일치)
 */
export function isRolledBackStatus(status: RenderStatus): boolean {
  return status === 'CANCELLED' || status === 'FAILED';
}

/**
 * 영상 프로젝트 한 씬(조합 스펙): 저장 기획안 씬에서 파생한 편집 가능한 단위
 * subtitle.style/durationSec/transition 은 미래 편집(폰트, 위치, 길이, 전환) 자리
 */
export interface VideoProjectScene {
  order: number;
  imageUploadId: string;
  narration: string;
  subtitle: { text: string; style?: Record<string, unknown> };
  durationSec?: number;
  transition?: string;
}

/**
 * 만들어진 세그먼트 하나(= 장면 하나의 렌더 결과)
 * 진행 중에는 어느 칸이 만들어졌는지, 끝난 뒤에는 어느 칸이 무엇이 되었는지를 전달
 * 후자가 세그먼트 격자와 '이 칸만 다시 만들기' 의 근거다.
 */
export interface VideoProjectSegment {
  order: number;
  // 'waiting' | 'running' | 'done'. 어휘는 렌더 소유라 좁히지 않음
  status: string;
  clipUploadId: string | null;
  // 이 세그먼트 클립 재생 URL. BFF 재구성(uploadId → 서명 URL)
  clipUrl: string | null;
  durationSec: number | null;
  // 이 세그먼트를 만든 화면 묘사. 다시 만들기 전에 고칠 대상이라 함께 전달
  prompt: string | null;
}

/**
 * 영상 프로젝트: 저장 기획안을 스냅샷해 만든 편집 가능한 영상 조합 스펙 + 렌더 상태
 * thumbnailUrl(카드 그림)과 resultUrl(완성 영상)은 BFF 가 uploadId 로 재구성
 */
export interface VideoProject {
  id: number;
  channelId: number | null;
  savedPlanId: number | null;
  title: string;
  aspectRatio: string;
  // 원천 영상 화질('720p' 등): 만들기 시점 선택 스냅샷. 재렌더도 이 값으로 재현
  resolution: string;
  videoModel: string;
  videoMode: string;
  ttsModel: string;
  ttsVoice: string;
  ttsPitch: string;
  scenes: VideoProjectScene[];
  renderStatus: RenderStatus;
  // 렌더 진행률(0~100). 렌더 중일 때만 채워진다(그 외 null)
  progress: number | null;
  // 렌더 구간('SCENES' = 세그먼트를 만드는 중, 'FINALIZING' = 이어붙이는 중)
  // 렌더 중일 때만 채워지고 진행 화면의 단계 표시가 이 값에서 파생
  renderStage: string | null;
  // 만들어진 세그먼트 목록. 다중 씬 렌더에서만 채워진다(그 외 null)
  segments: VideoProjectSegment[] | null;
  resultUploadId: string | null;
  // 완성 영상 재생 URL(renderStatus=COMPLETED 일 때). BFF 재구성
  resultUrl: string | null;
  // 작업 공간에 배치된 시각(ISO). 아직이면 null
  // 확정 단계를 가진 버전에서는 이 값이 있는 것만 워크스페이스 목록에 선다(workspaceRenders)
  placedAt: string | null;
  // 카드 그림 URL. BFF 재구성
  // 사람이 붙인 대표 썸네일이 먼저이고 없으면 첫 씬 이미지로 떨어진다.
  // 씬 이미지를 만들지 않는 버전에서는 그 썸네일이 이 카드의 유일한 그림
  thumbnailUrl: string | null;
  error: string | null;
  // 실패 사유 코드. 값 공간은 렌더(video-model)가 소유하고 화면은 아는 코드만 다르게 알린다
  // (lib/renderFailure). 분류되지 않은 실패와 성공, 구 서버는 null
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 영상 카드 공통 형태: 원천 영상(VideoProject)과 최종 영상(VideoFinal)이 공유하는 그리드 렌더 필드
 * VideoProjectGrid 가 이 형태로 렌더한다(둘 다 구조적으로 VideoCard 를 만족한다)
 */
export interface VideoCard {
  id: number;
  title: string;
  // 이 영상의 화면비('9:16' 등): 만들기 시점 스냅샷이라 카드 상자를 이 값으로 렌더
  // 버전에서 다시 파생하지 않는 이유: 규칙이 바뀌어도 이미 만든 영상의 모양은 그대로다.
  // 규칙으로 그리면 옛 영상이 새 상자에 담겨 잘려 보인다.
  aspectRatio: string;
  renderStatus: RenderStatus;
  progress: number | null;
  resultUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  // 생성에 쓰인 모델(정보 팝오버용). 원천 영상은 채우고 최종 영상은 없다(세트 합성이라 AI 무관)
  // 있으면 카드 우상단 i 버튼으로 표시. video/tts 는 aiModelOptions 카탈로그 key
  videoModel?: string;
  videoMode?: string;
  ttsModel?: string;
  ttsVoice?: string;
}

/**
 * 최종 영상: 완성된 원천 영상에 세트(프레임 + 아웃트로)를 입힌 배포용 파생본(원천 1:N 최종)
 * 합성은 video-model FINALIZE 잡이고 resultUrl 은 BFF 가 uploadId 로 재구성
 * thumbnailUrl 은 늘 null 이다. 이 표에 대표 그림 컬럼이 없고 만들어지는 경로도 세트 합성 하나뿐이라
 * 그림이 생길 자리가 없다(카드는 완성본을 인라인 재생한다)
 */
export interface VideoFinal extends VideoCard {
  // 원천 영상 프로젝트 id(원천 삭제 시 null)
  parentSourceId: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 보관함 항목 = 영상 카드 + 소유자. 보관함은 남의 것도 함께 보이는 유일한 목록이라 소유자 표시가 필요하다.
 * 어느 표에서 왔는지는 여기 없다. 원천과 최종을 나누는 버전에서는 최종 영상이, 나누지 않는 버전에서는
 * 그 하나뿐인 영상이 담긴다(versionProfile.archiveSource). 화면이 하는 일은 두 경우가 동일
 */
export interface ArchivedVideo extends VideoCard {
  ownerUserId: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 기획서 생성 프롬프트 뷰: 고정 머리/꼬리(읽기 전용) + 편집 가능한 중간 지침 + 기본값(리셋용)
 * 작업자가 instructions 만 편집하고 그것이 최종 시스템 프롬프트의 중간에 끼워진다.
 */
export interface PlanPromptView {
  header: string;
  footer: string;
  defaultInstructions: string;
  instructions: string;
  // 채널이 고른 이미지 모델에 적용되는 안전 제약(고정, 읽기 전용). 해당 없으면 ''
  // 작업자가 "왜 이런 연출이 안 나오지" 를 알 수 있게 그대로 표시
  imageSafetyDirective: string;
}

// 프로세스(읽기전용 타임라인 뷰): 백엔드의 버전별 뷰 빌더(PLAN_PROCESS_VIEWS)와 convention-sync

/** 노드 종류: 고정(계약) / 편집가능(작업자 지침) / 조건부(옵션, 모델) / 생성 시 주입 */
export type PromptNodeKind = 'fixed' | 'editable' | 'conditional' | 'injected';

/** 프롬프트 세그먼트 노드 1개 */
export interface PromptNode {
  id: string;
  title: string;
  kind: PromptNodeKind;
  // 실제 프롬프트 원문(영어) 또는 템플릿/플레이스홀더
  content: string;
  // 조건과 런타임 주입 표기(언제 들어가나)
  note?: string;
  // 이 노드가 참조하는 다른 노드 id: 시스템 규칙 → 유저 데이터 방향. 역방향은 화면이 계산
  links?: string[];
}

/** 프롬프트 하나(= 한 레인)와 그 안의 순서 있는 노드들 */
export interface PromptPhase {
  id: string;
  title: string;
  subtitle?: string;
  nodes: PromptNode[];
}

/** 스텝 실행 특성: 순차(하나씩) / 병렬(팬아웃) */
export type StepExecution = 'sequential' | 'parallel';

/** 프롬프트 주입 이벤트: 언제, 몇 번, 어떻게 프롬프트가 실제 모델에 들어가는지 */
export interface PromptInjection {
  summary: string;
  target: string;
  cardinality: string;
  timing: string;
  assembly: string;
  condition?: string;
  output?: string;
}

/** 스텝 내부 실행 하위단계: 스텝 안에서 순서대로 일어나는 작업. 프롬프트 주입 지점을 드러낸다. */
export interface ProcessSubstep {
  id: string;
  title: string;
  injectsPrompt?: boolean;
  note?: string;
}

/**
 * 파이프라인 스텝 1개. execution 으로 순차/병렬 표기
 * usesPrompt=true 면 이 스텝에서 주입되는 프롬프트와 주입 이벤트를 담고, false 면 prompts 는 비고
 * note 로 무엇을 하는지 설명
 */
export interface ProcessStep {
  id: string;
  title: string;
  subtitle?: string;
  execution: StepExecution;
  usesPrompt: boolean;
  prompts: PromptPhase[];
  injection?: PromptInjection;
  substeps?: ProcessSubstep[];
  note?: string;
}

/** 제작 단계(파트): 기획서 생성 / 원천 영상 생성 / 최종 영상 생성. 스텝을 실행 순서대로 보관 */
export interface ProcessStage {
  id: string;
  title: string;
  subtitle?: string;
  steps: ProcessStep[];
}

/** 프로세스 전체: 제작 3단계로 나눈 파이프라인 */
export interface ProcessView {
  stages: ProcessStage[];
}
