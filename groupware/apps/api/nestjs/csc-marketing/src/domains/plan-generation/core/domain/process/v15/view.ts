/**
 * v1.5(텍스트→영상) 프로세스 뷰: 키워드 준비 → 기획서 생성(입력 정제 포함) → 영상 생성
 *
 * 영상 모델이 화면과 말을 함께 만든다. 그래서 씬 이미지 스텝이 없고, TTS 도 없고, 세트를 입힌
 * 배포본도 없다(에셋 화면이 없어 세트를 만들 방법 자체가 없다). 단계가 셋이고, 세그먼트 클립을
 * 만드는 하위단계는 둘이다. 기획 단계 앞에는 이 버전만 갖는 입력 정제 스텝이 있다(직접 적는 칸이
 * 이 버전에만 있다).
 *
 * 한 벌을 두 버전에 보여주면 이 화면이 서버가 400 으로 막는 씬 이미지 스텝과 일어날 수 없는 최종
 * 합성 단계를 설명하게 되고, 삼항으로 가르면 이 버전을 읽는 사람이 상대 버전의 문장까지 읽어야
 * 한다. 그래서 있는 것만 적는다.
 */
import { buildKeywordStage } from '../keyword-stage';
import { SCENE_DIALOGUE_FALLBACK, SCENE_NARRATION_FALLBACK, toNodes } from '../segment-nodes';
import {
  BRIEF_REFINER_VIEW_CONTEXT,
  systemViewContext,
  USER_VIEW_CONTEXT,
} from '../view-context';
import type {
  BuildProcessViewInput,
  ProcessStage,
  ProcessStep,
  ProcessView,
  PromptPhase,
} from '../types';

/**
 * 이 버전은 입력 방식이 둘이고 프롬프트 방식은 이 단계를 밟지 않는다. 단계를 빼는 대신 조건을
 * 적는다: 컨셉입력으로 만들 때는 실제로 도는 단계라, 빼면 그 경로가 화면에서 사라진다.
 */
const KEYWORD_SUBTITLE =
  '기획서에 쓸 목적 키워드를 정하는 단계. **컨셉입력 방식에서만 실행됩니다**(프롬프트 방식은 적은 문장이 곧 주제라 이 단계를 밟지 않습니다). **수집 데이터는 여기까지만 쓰입니다.** 기획서는 여기서 작업자가 고른 키워드만 받고 수집 원문을 받지 않습니다.';

/**
 * 입력 정제 스텝. 작업자가 적은 원문이 기획 LLM 에 닿기 전에 파이프라인이 읽는 형식으로 바뀐다.
 * 이 스텝의 결과가 기획 유저 프롬프트의 [사용자 입력사항]과 [제한사항] 절을 대신한다.
 */
function refineBriefStep(input: BuildProcessViewInput): ProcessStep {
  const systemPhase: PromptPhase = {
    id: 'brief-refiner-system',
    title: '입력 정제: 시스템 프롬프트',
    subtitle:
      '이 파이프라인이 받는 형식과 정제 규칙, 출력 스키마. 요청의 system 필드로 나갑니다.',
    nodes: toNodes(input.segments.briefRefinerSystem, BRIEF_REFINER_VIEW_CONTEXT),
  };
  const userPhase: PromptPhase = {
    id: 'brief-refiner-user',
    title: '입력 정제: 유저 프롬프트',
    subtitle:
      '작업자가 생성 화면에 적은 씬/사용자 입력사항과 제한사항 원문이 그대로 들어갑니다(전부 런타임 값).',
    nodes: toNodes(input.segments.briefRefinerUser, BRIEF_REFINER_VIEW_CONTEXT),
  };
  // 모델 이름은 서비스가 파이프라인 표에서 읽어 넘긴다. 여기 적어 두면 표가 바뀔 때 화면만 옛 값을 말한다.
  const model = input.briefRefinerLlm ?? '(정제 모델 미지정)';
  return {
    id: 'refine-brief',
    title: '입력 정제 (LLM)',
    subtitle: '작업자가 적은 지시를 이 파이프라인이 읽는 동영상 단위로 다시 쓴다.',
    execution: 'sequential',
    usesPrompt: true,
    prompts: [systemPhase, userPhase],
    injection: {
      summary: 'LLM 생성 1회 (씬/사용자 입력사항이나 제한사항을 적었을 때만)',
      target: `LLM 생성 호출 (POST /inference/generate): 이 버전이 고정한 정제 모델 ${model}`,
      cardinality: '생성 버튼당 최대 1회. 두 칸이 모두 비어 있으면 나가지 않는다.',
      timing:
        '기획안 생성 호출 직전. 이 호출의 결과가 기획 유저 프롬프트의 [사용자 입력사항]과 [제한사항] 절을 대신하고, 나온 동영상 수가 다음 호출의 동영상 개수 지시가 된다.',
      assembly:
        'system 필드(파이프라인이 받는 형식 + 정제 규칙 + 출력 스키마)와 user 메시지(입력 원문)를 한 요청에 함께 담아 보낸다.',
      condition:
        '씬/사용자 입력사항 또는 제한사항 중 하나라도 적었을 때만 나간다. 정제에 실패하면 생성을 멈추고 알린다(원문을 그대로 넘겨 조용히 진행하지 않는다).',
      output:
        '동영상 단위로 정리된 장면 구성과 말(대화내용/나레이션/없음), 한 줄씩 정리된 제한사항, 그리고 무엇을 바꿨는지의 목록을 JSON 객체 하나로 출력한다.',
    },
    note: '시간 표기((0-8초))와 단계 태그([훅], [CTA])를 걷어내고, 동영상 밖에 따로 적힌 전체 나레이션을 각 동영상에 나눠 붙이고, 길이를 넘는 말을 줄이고, 화면에 글자나 로고를 넣으라는 지시를 뺍니다. 내용을 새로 짓지는 않습니다. 무엇을 바꿨는지는 활동 로그의 상세에 남습니다.',
  };
}

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
      '채널/브랜드/목적 키워드/오디오 후보를 생성 시점에 주입(전부 런타임 값). 사용자 입력사항과 제한사항은 앞 스텝의 정제본이 들어갑니다. 요청 messages 의 user 역할 메시지로 나갑니다. 수집 데이터는 여기 들어오지 않습니다(키워드 단계에서 이미 쓰였습니다).',
    nodes: toNodes(input.segments.user, USER_VIEW_CONTEXT),
  };

  return {
    id: 'plan',
    title: '기획서 생성',
    subtitle:
      '작업자가 적은 지시를 정제하고, 고른 키워드로 기획안을 만들어 저장하는 단계. 이 파이프라인은 씬 이미지를 만들지 않고, 기획안이 쓴 장면 구성이 다음 단계에서 그대로 화면이 됩니다.',
    steps: [
      refineBriefStep(input),
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
          //   버전마다 다르다(영상 한 편을 만드는 이쪽이 낮다). 여기 사본을 두면 한쪽만 바뀔 때
          //   화면이 조용히 옛 값을 말하고, 그것은 아무도 확인하지 않는 종류의 거짓이다.
          timing: '작업자가 생성 버튼을 누른 직후 실행되는 블로킹 단일 호출. 이 호출이 끝나면 기획안이 저장된다.',
          assembly: 'system 필드(고정 골격 + 편집 지침)와 user 메시지(채널/브랜드/목적 키워드/오디오 후보)를 한 요청(POST /inference/generate)에 함께 담아 보낸다. 따로 나가는 두 호출이 아니라 같은 호출의 두 입력이다. 모델 단에서 Claude 는 top-level system 파라미터 + user 메시지로, vLLM 은 system 역할 + user 역할 메시지로 전달된다.',
          output: '시스템의 JSON 스키마 계약에 맞춰, 유저가 준 데이터(브랜드/목적 키워드/오디오 후보)로 채운 기획안 N개를 JSON 배열로 한 번에 출력한다.',
        },
        note: '기획안 개수 × 씬 전부를 단일 LLM 호출로 한 번에 생성합니다(JSON 배열).',
      },
      {
        id: 'save-plan',
        title: '기획안 저장',
        subtitle: '만들어진 기획안을 워크스페이스에 저장.',
        execution: 'sequential',
        usesPrompt: false,
        prompts: [],
        note: '생성된 기획안을 개인 워크스페이스에 스냅샷으로 저장합니다. 이 버전에서는 저장이 끝나는 즉시 다음 단계(영상 생성)가 이어집니다. DB 저장 작업이라 자연어 프롬프트를 쓰지 않습니다.',
      },
    ],
  };
}

function sourceStage(input: BuildProcessViewInput): ProcessStage {
  const sceneDialogue = input.videoModel?.sceneDialogue ?? SCENE_DIALOGUE_FALLBACK;
  const sceneNarration = input.videoModel?.sceneNarration ?? SCENE_NARRATION_FALLBACK;

  /**
   * 세그먼트 비주얼 프롬프트. 이 버전에는 씬 이미지가 없으므로 이 문장이 화면을 만든다.
   */
  const composeVisualPhase: PromptPhase = {
    id: 'compose-visual',
    title: '세그먼트 비주얼 프롬프트',
    subtitle: '영상 provider 에 나가는 프롬프트(이 문장이 화면을 만든다)',
    nodes: [
      {
        id: 'scene-composition',
        title: '장면 구성',
        kind: 'injected',
        content: '{그 세그먼트의 장면 구성}',
        note:
          '기획 LLM 이 세그먼트마다 써 둔 화면 묘사가 그대로 나갑니다. 이 파이프라인에는 씬 이미지가 없으므로 **이 문장이 화면을 만듭니다**. 길이가 provider 상한을 넘으면 뒤의 대사보다 이쪽을 먼저 줄입니다(대사가 잘리면 인물이 입만 움직입니다).',
      },
      {
        id: 'scene-dialogue',
        title: '대사 지시',
        kind: 'conditional',
        content: sceneDialogue.content,
        note:
          '그 세그먼트에 대화내용이 있을 때 장면 구성 뒤에 붙습니다. 문구 안의 {line} 자리에 그 대화내용이 들어가고, 영상 모델이 픽셀과 같은 패스에서 그 말을 립싱크로 만듭니다.',
      },
      {
        id: 'scene-narration',
        title: '나레이션 지시',
        kind: 'conditional',
        content: sceneNarration.content,
        note:
          '그 세그먼트에 나레이션이 있을 때 대사 지시 대신 붙습니다. 문구 안의 {line} 자리에 그 나레이션이 들어가고, 화면 속 인물이 아니라 화면 밖 목소리가 읽습니다. 한 세그먼트는 대화내용과 나레이션 중 하나만 가지므로 두 지시가 함께 나가지 않습니다.',
      },
    ],
  };

  return {
    id: 'source',
    // 이 버전에는 뒤따르는 최종 단계가 없어 이것이 곧 완성본이다. '원천' 은 뒤에 최종이 있을 때만
    //   뜻이 있는 이름이라, 여기서는 그냥 '영상 생성' 이다(워크스페이스 구역 이름과도 같다)
    title: '영상 생성',
    subtitle:
      '저장한 기획안을 텍스트→영상으로 합성(씬 비주얼 + BGM/효과음). 말은 영상 모델이 화면과 함께 만듭니다. 이 단계의 산출물이 곧 완성본입니다.',
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
        // 이 버전은 소리를 만들지 않는다. 그래서 둘만 밟는다: 말이 벤더 클립 안에 이미 끝나 있어
        // 붙일 음성도 맞출 길이도 없다(받아온 클립을 자르면 문장이 잘린다). 길이를 정하는 것은
        // 요청 길이 하나뿐이라, TTS 자리에 문장에서 시간을 추정하는 단계가 대신 선다.
        substeps: [
          {
            id: 'speech-duration',
            title: '발화 길이 산정',
            note: '말해질 문장(그 세그먼트의 대화내용 또는 나레이션)에서 걸리는 시간을 추정해 그 길이로 영상을 요청합니다. 소리를 만들지 않으므로 잴 파일이 없어 텍스트에서 추정하며, 모자라면 문장이 끊기고 넘치면 끝에 정적이 남을 뿐이라 넉넉한 쪽으로 잡습니다. 말이 없는 세그먼트는 기본 길이를 씁니다.',
          },
          {
            id: 'visual',
            title: '세그먼트 비주얼 렌더',
            injectsPrompt: true,
            note: '여기서 프롬프트가 provider 에 나갑니다. 그 세그먼트의 장면 구성이 화면을 만들고, 그 세그먼트의 말이 지시로 함께 실립니다(대화내용이면 인물이 립싱크로 말하고, 나레이션이면 화면 밖 목소리가 읽습니다). 받아온 클립은 자르지도 늘리지도 않습니다.',
          },
        ],
        injection: {
          summary: '영상 provider 호출: 세그먼트마다',
          target: '영상 생성 provider: 플랫폼(Higgsfield) 경유 텍스트→영상 모델',
          cardinality: '세그먼트마다 1회.',
          timing:
            '각 세그먼트의 「비주얼 렌더」 하위단계에서 provider 파라미터(prompt)로 전달된다. 발화 길이 산정 다음이며, 그 길이가 요청 길이로 함께 나간다.',
          assembly:
            '그 세그먼트의 장면 구성. 대화내용이 있으면 대사 지시가, 나레이션이 있으면 나레이션 지시가 뒤에 붙는다. 길이가 상한을 넘으면 장면 구성 쪽을 먼저 줄인다(말이 잘리면 인물이 입만 움직인다).',
          output:
            '그 세그먼트의 짧은 영상 클립. 말이 있으면 그 말이 담긴 유성 클립이고(대화내용은 인물의 입에서, 나레이션은 화면 밖에서), 말이 없으면 무음이다.',
        },
        note: '세그먼트마다 발화 길이 산정 → 비주얼 렌더 순으로 진행합니다. 이 서버는 소리를 만들지 않고 말을 프롬프트에 실어 보내므로, 붙일 음성도 맞출 길이도 없습니다.',
      },
      {
        id: 'concat-audio-captions',
        title: '이어붙이기 + 오디오 믹스 + 자막 트랙',
        subtitle: '씬 클립을 잇고 BGM/효과음을 얹고 자막 트랙을 만든다.',
        execution: 'sequential',
        usesPrompt: false,
        prompts: [],
        note: '씬 클립을 순서대로 이어붙이고(concat), BGM 베드와 씬별 효과음(SFX)을 믹스한 뒤, 시간동기 자막 트랙(JSON)을 저장합니다. 여기까지가 만드는 일의 마지막이고, 나온 영상은 생성 창의 결과 화면에 나타납니다. **워크스페이스에는 그 화면에서 「영상 생성」 을 눌러야 놓입니다**(그 버전의 목록은 그렇게 확정한 영상만 담습니다). ffmpeg 합성이라 자연어 프롬프트를 쓰지 않습니다.',
      },
    ],
  };
}

export const PLAN_PROCESS_VIEW_V15 = {
  build(input: BuildProcessViewInput): ProcessView {
    return {
      stages: [
        buildKeywordStage(input.segments, KEYWORD_SUBTITLE),
        planStage(input),
        sourceStage(input),
      ],
    };
  },
};
