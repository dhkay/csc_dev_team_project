/**
 * v1.0(이미지→영상) 프로세스 뷰: 키워드 준비 → 기획서 생성(+씬 이미지) → 원천 영상 생성 → 최종 영상 생성
 *
 * 이 버전의 파이프라인은 씬마다 정지 이미지를 먼저 만들고 그것을 움직인 뒤, 나레이션을 TTS 로
 * 합성해 얹고, 마지막에 세트(배경프레임 + 아웃트로)를 입힌 배포본을 따로 만든다. 그래서 단계가
 * 넷이고, 세그먼트 클립을 만드는 하위단계도 넷이다.
 *
 * 버전을 받아 삼항으로 가르지 않고 있는 것만 적는다. 조건으로 가르면 이 버전을 읽는 사람이 다른
 * 버전의 문장까지 읽어야 하고 없는 단계를 조건으로 표현하게 된다.
 * 그래서 씬 이미지 스텝도 최종 단계도 배열 안에 그냥 있다.
 */
import { SCENE_IMAGE_VIEW_CONTEXT } from '../../plan-image-prompt';
import { buildKeywordStage } from '../keyword-stage';
import { SCENE_MOTION_FALLBACK, toNodes } from '../segment-nodes';
import { systemViewContext, USER_VIEW_CONTEXT } from '../view-context';
import type {
  BuildProcessViewInput,
  ProcessStage,
  ProcessView,
  PromptPhase,
} from '../types';

const KEYWORD_SUBTITLE =
  '기획서에 쓸 목적 키워드를 정하는 단계. **수집 데이터는 여기까지만 쓰입니다.** 기획서는 여기서 작업자가 고른 키워드만 받고 수집 원문을 받지 않습니다.';

function planStage(input: BuildProcessViewInput): ProcessStage {
  const systemPhase: PromptPhase = {
    id: 'plan-system',
    title: '기획서 생성: 시스템 프롬프트',
    subtitle:
      '모델에게 "무엇을, 어떤 형식으로" 만들지 지시하는 고정 골격 + 편집 지침. 요청의 system 필드로 나갑니다(Claude 는 top-level system 파라미터, vLLM 은 system 역할 메시지).',
    nodes: toNodes(
      input.segments.system,
      systemViewContext(input.instructions, input.imageModel),
    ),
  };

  const userPhase: PromptPhase = {
    id: 'plan-user',
    title: '기획서 생성: 유저 프롬프트',
    subtitle:
      '채널/브랜드/목적 키워드/오디오 후보를 생성 시점에 주입(전부 런타임 값). 요청 messages 의 user 역할 메시지로 나갑니다. 수집 데이터는 여기 들어오지 않습니다(키워드 단계에서 이미 쓰였습니다).',
    nodes: toNodes(input.segments.user, USER_VIEW_CONTEXT),
  };

  return {
    id: 'plan',
    title: '기획서 생성',
    subtitle: '고른 키워드로 기획안을 만들고, 각 씬의 이미지를 생성해 저장하는 단계.',
    steps: [
      {
        id: 'generate-plan',
        title: '기획안 생성 (LLM)',
        subtitle: '기획안과 씬 구성을 한 번의 LLM 호출로 생성.',
        execution: 'sequential',
        usesPrompt: true,
        prompts: [systemPhase, userPhase],
        injection: {
          summary: 'LLM 생성 1회: system + user 를 한 요청에 함께 전송',
          target: 'LLM 생성 호출 (POST /inference/generate): 채널이 고른 LLM 모델',
          cardinality: '생성 버튼당 1회. 기획안 N개와 모든 씬을 한 응답(JSON 배열)으로 한꺼번에 받는다.',
          // 전송 노브의 숫자를 적지 않는다. temperature 는 그 버전의 어댑터가 소유하고
          //   버전마다 다르다(기획안 여러 개를 받는 쪽이 높다). 여기 사본을 두면 한쪽만 바뀔 때
          //   화면이 조용히 옛 값을 말하고, 그것은 아무도 확인하지 않는 종류의 거짓이다.
          //   읽는 사람이 그 숫자로 할 수 있는 일도 없다.
          timing: '작업자가 생성 버튼을 누른 직후 실행되는 블로킹 단일 호출. 이 호출이 끝나야 씬 이미지 생성으로 넘어간다.',
          assembly: 'system 필드(고정 골격 + 편집 지침)와 user 메시지(채널/브랜드/목적 키워드/오디오 후보)를 한 요청(POST /inference/generate)에 함께 담아 보낸다. 따로 나가는 두 호출이 아니라 같은 호출의 두 입력이다. 모델 단에서 Claude 는 top-level system 파라미터 + user 메시지로, vLLM 은 system 역할 + user 역할 메시지로 전달된다.',
          output: '시스템의 JSON 스키마 계약에 맞춰, 유저가 준 데이터(브랜드/목적 키워드/오디오 후보)로 채운 기획안 N개를 JSON 배열로 한 번에 출력한다.',
        },
        note: '기획안 개수 × 씬 전부를 단일 LLM 호출로 한 번에 생성합니다(JSON 배열).',
      },
      {
        id: 'generate-scene-image',
        title: '씬 이미지 생성',
        subtitle: '각 씬의 대표 이미지를 이미지 모델로 생성.',
        execution: 'parallel',
        usesPrompt: true,
        prompts: [
          {
            id: 'scene-image',
            title: '씬 이미지 생성 프롬프트',
            subtitle: '각 씬 이미지를 만들 때 이미지 모델로 나가는 프롬프트(전부 영어)',
            nodes: toNodes(input.segments.sceneImage, SCENE_IMAGE_VIEW_CONTEXT),
          },
        ],
        injection: {
          summary: '이미지 모델 호출: 씬마다 1회(병렬)',
          target: '이미지 생성 호출 (POST /inference/images): 채널이 고른 이미지 모델',
          cardinality:
            '씬마다 1회. 씬 수만큼 요청이 병렬로 나간다(자체 이미지 모델은 공유 GPU 큐로 순서대로 처리, 외부 모델은 벤더가 병렬 처리).',
          timing: '기획안 생성이 끝난 뒤 씬별로 각각 전송된다. 씬마다 seed 가 달라 구도가 갈린다.',
          assembly:
            '스타일 앵커 + 이 컷 브리프 + 무드 + 형식 규칙을 이어붙인 하나의 텍스트 프롬프트(메시지 role 구분 없음). 씬마다 「이 컷 브리프」만 달라진다.',
          output: '그 씬의 정지 이미지 1장을 생성한다(씬마다 seed 가 달라 구도가 갈린다).',
        },
        note: '씬마다 1건씩 요청해 여러 씬을 병렬로 생성합니다.',
      },
      {
        id: 'save-plan',
        title: '기획안 저장',
        subtitle: '고른 기획안과 씬 이미지를 워크스페이스에 저장.',
        execution: 'sequential',
        usesPrompt: false,
        prompts: [],
        note: '생성된 기획안과 씬 이미지를 개인 워크스페이스에 스냅샷으로 저장합니다. DB 저장 작업이라 자연어 프롬프트를 쓰지 않습니다.',
      },
    ],
  };
}

function sourceStage(input: BuildProcessViewInput): ProcessStage {
  const sceneMotion = input.videoModel?.sceneMotion ?? SCENE_MOTION_FALLBACK;

  /**
   * 세그먼트 비주얼 프롬프트. 이 버전은 이미지가 화면을 이미 정했으므로 움직임만 지시한다.
   */
  const composeVisualPhase: PromptPhase = {
    id: 'compose-visual',
    title: '세그먼트 비주얼 프롬프트',
    subtitle: '영상 provider 에 나가는 프롬프트(씬 이미지가 화면을 정하므로 움직임만 지시한다)',
    nodes: [
      {
        id: 'scene-motion',
        title: '씬 모션 프롬프트',
        // 조건부다: 슬라이드쇼(기본/폴백)는 정지 이미지를 그대로 써서 이 프롬프트를 보내지 않는다.
        kind: 'conditional',
        content: sceneMotion.content,
        note:
          '씬 이미지가 화면을 이미 정했으므로 프롬프트는 움직임만 지시합니다(자체 Wan I2V 든 외부 Grok Imagine 이든 같은 값). 어느 provider 를 쓸지는 환경설정의 영상 모델 + 배포/조직 키가 정하며, 외부 모델은 조직 키가 없으면 슬라이드쇼로 폴백합니다. 슬라이드쇼는 정지 이미지를 그대로 써서 이 프롬프트를 쓰지 않습니다.',
      },
    ],
  };

  return {
    id: 'source',
    title: '원천 영상 생성',
    subtitle: '저장한 기획안을 이미지→영상으로 합성(씬 비주얼 + 나레이션 TTS + BGM/효과음).',
    steps: [
      {
        id: 'create-project',
        title: '프로젝트 생성 + 렌더 잡 적재',
        subtitle: '렌더 스펙을 만들고 합성 작업을 큐에 넣는다.',
        execution: 'sequential',
        usesPrompt: false,
        prompts: [],
        note: '기획안에서 렌더 스펙(씬/오디오/영상 모델)을 만들고 합성(COMPOSE) 작업을 큐에 적재한 뒤 상태를 RENDERING 으로 둡니다. 잡 준비/적재라 자연어 프롬프트를 쓰지 않습니다.',
      },
      {
        id: 'compose-scenes',
        title: '세그먼트 클립 생성',
        subtitle:
          '세그먼트를 하나씩 영상 클립으로 만든다. 순서대로 만들지 몇 개씩 겹쳐 만들지는 생성 시 고른다.',
        // 표기는 기본값(순차)을 따른다. 생성 화면에서 '빠른 생성' 을 고르면 몇 개씩 겹쳐 돈다.
        execution: 'sequential',
        usesPrompt: true,
        prompts: [composeVisualPhase],
        // 이 버전은 소리를 만든다. 그래서 넷을 밟는다: TTS 로 길이를 재고, 그 길이로 비주얼을
        // 만들고, 편차를 맞추고, 오디오를 붙인다.
        substeps: [
          {
            id: 'tts',
            title: '나레이션 TTS',
            note: '대화내용을 음성으로 합성하고 그 길이가 그 세그먼트 영상의 길이가 됩니다(먼저 소리를 만들고 그 길이로 영상을 요청합니다). 음성/피치 설정이라 프롬프트가 아닙니다.',
          },
          {
            id: 'visual',
            title: '세그먼트 비주얼 렌더',
            injectsPrompt: true,
            note: '여기서 프롬프트가 provider 에 나갑니다. 씬 이미지가 화면을 정하므로 모션 프롬프트만 보냅니다. 슬라이드쇼(기본/폴백)는 정지 이미지를 그대로 써서 보내지 않습니다.',
          },
          {
            id: 'fit',
            title: '길이 맞춤',
            note: '비주얼 클립을 나레이션 길이에 정확히 맞춥니다(provider 편차 흡수).',
          },
          {
            id: 'mux',
            title: '오디오 합치기',
            note: '클립의 자체 오디오를 버리고 나레이션을 붙입니다. 둘 다 남기면 한 화면에서 두 사람이 동시에 말합니다.',
          },
        ],
        injection: {
          summary: '영상 provider 호출: 세그먼트마다',
          target: '영상 생성 provider: 자체 Wan I2V(submit/poll), 외부 Grok Imagine(image→video)',
          cardinality: '세그먼트마다 1회. 단, 그 세그먼트의 비주얼이 AI 모션일 때만 나간다.',
          timing:
            '각 세그먼트의 「비주얼 렌더」 하위단계에서 provider 파라미터(prompt)로 전달된다. TTS 다음, 길이 맞춤 전.',
          assembly: '고정 모션 문자열 하나. 화면은 씬 이미지가 이미 정했다.',
          condition:
            '슬라이드쇼(기본/폴백)는 정지 이미지를 그대로 써서 이 프롬프트를 보내지 않는다.',
          output: '그 세그먼트의 짧은 영상 클립(무음). 나레이션을 얹어 완성한다.',
        },
        note: '세그먼트마다 TTS → 비주얼 렌더 → 길이 맞춤 → mux 순으로 진행합니다.',
      },
      {
        id: 'concat-audio-captions',
        title: '이어붙이기 + 오디오 믹스 + 자막 트랙',
        subtitle: '씬 클립을 잇고 BGM/효과음을 얹고 자막 트랙을 만든다.',
        execution: 'sequential',
        usesPrompt: false,
        prompts: [],
        note: '씬 클립을 순서대로 이어붙이고(concat), BGM 베드와 씬별 효과음(SFX)을 믹스한 뒤, 시간동기 자막 트랙(JSON)을 저장합니다. 자막을 화면에 굽는(번인) 것은 다음 최종 단계입니다. ffmpeg 합성이라 자연어 프롬프트를 쓰지 않습니다.',
      },
    ],
  };
}

/**
 * 세트(배경프레임 + 아웃트로) 합성 단계. 이 버전에만 있다: 에셋 화면이 없는 버전은 세트를
 * 만들 방법이 없어 이 단계가 일어날 수 없다(versionProfile.sections 와 같은 사실)
 */
const FINAL_STAGE: ProcessStage = {
  id: 'final',
  title: '최종 영상 생성',
  subtitle: '세트(배경프레임 + 아웃트로)와 자막을 입힌 배포본.',
  steps: [
    {
      id: 'finalize-composite',
      title: '최종 합성',
      subtitle: '프레임/자막/아웃트로를 입혀 배포본으로 굽는다.',
      execution: 'parallel',
      usesPrompt: false,
      prompts: [],
      note: '프레임 배경과 아웃트로를 병렬로 내려받고, 자막 밴드 폭을 병렬로 측정한 뒤, 「프레임 배경 + 원천 영상 오버레이 + 제목/시간동기 자막 번인」 합성과 아웃트로 정규화를 병렬로 수행하고 이어붙입니다(ffmpeg). 자막 내용은 원천 영상 단계의 시간동기 트랙에서, 스타일(폰트/글자색/밴드)은 세트 설정에서 오므로 자연어 프롬프트를 사용하지 않습니다.',
    },
  ],
};

export const PLAN_PROCESS_VIEW_V10 = {
  build(input: BuildProcessViewInput): ProcessView {
    return {
      stages: [
        buildKeywordStage(input.segments, KEYWORD_SUBTITLE),
        planStage(input),
        sourceStage(input),
        FINAL_STAGE,
      ],
    };
  },
};
