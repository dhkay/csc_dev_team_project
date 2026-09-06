/**
 * 버전이 정하는 파이프라인 사실: 그 버전이 무엇을 만들고 무엇을 만들지 않는가
 *
 * 화면 구성(탭, 구역, 버튼 라벨)은 담지 않는다. 그것은 파이프라인의 사실이 아니라 보여주기로 한
 * 결정이고 서버는 알 필요가 없다. 그 축의 주인은 화면 쪽 `versionProfile` 이다.
 */
import type { ToolVersion, ToolVersionRecord } from './versions';

/** 한 버전의 파이프라인. 필드가 늘면 모든 버전이 답해야 한다(그것이 이 타입의 목적이다). */
export interface ToolVersionPipeline {
  // 씬마다 정지 이미지를 먼저 만들고 그것을 영상으로 바꾸는가(이미지→영상).
  // 거짓이면 영상 모델이 문장에서 씬 영상을 바로 만들고, 이미지 생성 요청은 400 으로 막힌다.
  // 만들지 않는 이미지를 만들면 결과물에 쓰이지도 않으면서 GPU 를 점유하고 에러도 나지 않는다.
  readonly usesSceneImages: boolean;
  // 원천 영상에 세트(배경프레임 + 아웃트로)를 입힌 배포본을 따로 만드는가.
  // 거짓이면 원천이 곧 완성본이라 산출물이 하나이고, 세트를 만드는 에셋 화면 자체가 없다.
  readonly usesFinalComposite: boolean;
  // 이 버전이 만드는 영상의 화면비. 값은 `@csc/video-capabilities` 의 `AspectRatio` 문자열이다.
  // 타입으로 좁히지 않는 이유는 두 커널이 서로를 import 하지 않기 때문이고, 실제 렌더러가 아는
  // 값인지는 `scripts/check-marketing-aspect.mjs` 가 CI 에서 지킨다.
  // 이미 만들어진 영상은 영향받지 않는다. 화면비는 프로젝트 행에 굳는다.
  readonly aspectRatio: string;
  // 이 서버가 소리를 만드는가(나레이션 TTS).
  // 거짓이면 영상 모델이 말까지 만든다. 씬의 말을 영상 프롬프트에 실어 보내고 받아온 클립은
  // 자르지 않는다(자르면 문장이 잘린다).
  // 고르는 값이 아니다. 렌더 스펙의 `synthesizeSpeech` 는 행에 굳은 버전에서 파생된다.
  readonly synthesizesSpeech: boolean;
  // 기획 LLM 을 고정하는가. 고정이면 그 모델 key, 아니면 null(개인 설정을 따른다).
  // 이 키를 바꾸면 조직에 필요한 API 키가 바뀐다(제작사가 다르다).
  readonly pinnedPlanLlm: string | null;
  // 한 번에 만드는 기획안 수를 고정하는가. 고정이면 그 수, 아니면 null(작업자가 고른다).
  // 상한(`≤N`)이 아니라 고정값이다. 상한으로 두면 1~N 이 다 통과해 "정확히 하나" 를 표현하지
  // 못하고, 프롬프트는 1개라 말하는데 출력 토큰 예산만 부푼다.
  readonly pinnedProposalCount: number | null;
  // 작업자가 직접 적은 지시(씬/사용자 입력사항, 제한사항)를 기획 LLM 앞에서 정제하는가.
  // 정제하면 그 모델 key, 아니면 null(직접 적는 칸이 없는 버전). 기획 LLM 과 별개 슬롯인 이유:
  // 정제는 형식을 맞추는 일이라 기획 모델이 바뀌어도 이 모델은 그대로일 수 있고, 반대도 같다.
  readonly briefRefinerLlm: string | null;
}

/**
 * 버전별 파이프라인. 새 버전 추가 = 여기 한 덩어리.
 *
 * 이 덩어리를 채우면 서버(기획 생성 게이트, 렌더 스펙)와 화면(AI 역량 노출, 가격표, 설정)이
 * 함께 따라온다. 표를 흩어 두면 같은 일이 여러 파일을 고치는 일이 되고 몇은 빠뜨려도 조용하다.
 */
export const TOOL_VERSION_PIPELINES: ToolVersionRecord<ToolVersionPipeline> = {
  // 이미지→영상. 세트를 입힌 배포본이 이 버전의 완성물이다.
  'v1.0': {
    usesSceneImages: true,
    usesFinalComposite: true,
    // 영상이 배경 프레임 안의 한 자리(안전 구역)에 앉으므로 그 자리에 맞춘 값이다.
    // 자리의 모양은 렌더러가 갖고, 이 값이 맞는지는 check-marketing-aspect.mjs 가 검사한다.
    aspectRatio: '4:5',
    synthesizesSpeech: true,
    pinnedPlanLlm: null,
    // 서로 다른 기획안을 여러 개 받아 그중 하나를 고르는 것이 이 버전의 방식이다.
    pinnedProposalCount: null,
    // 직접 적는 칸이 없는 버전이라 정제할 입력도 없다.
    briefRefinerLlm: null,
  },
  // 텍스트→영상. 이미지도 TTS 도 없고 원천이 곧 완성본이다.
  'v1.5': {
    usesSceneImages: false,
    usesFinalComposite: false,
    // 영상 자체가 배포본이라 숏폼 규격을 그대로 쓴다(프레임 안에 들어가지 않는다)
    aspectRatio: '9:16',
    synthesizesSpeech: false,
    pinnedPlanLlm: 'claude-sonnet-5',
    // 만드는 것이 영상 한 편이라 기획안도 하나다(그 안의 세그먼트 수는 브리프에서 파생된다)
    pinnedProposalCount: 1,
    // 사람이 자유롭게 적은 지시(시간 구간, 단계 태그, 따로 모은 나레이션)를 파이프라인이 읽는
    // 동영상 단위로 다시 쓴다. 그 결과의 동영상 수가 곧 세그먼트 수다.
    briefRefinerLlm: 'claude-sonnet-5',
  },
};

/** 그 버전의 파이프라인. 사실 하나만 필요해도 이 함수를 거친다(출처가 한눈에 보인다). */
export function pipelineFor(version: ToolVersion): ToolVersionPipeline {
  return TOOL_VERSION_PIPELINES[version];
}
