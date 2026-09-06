// 입력 정제 결과와 그것을 기획 프롬프트가 읽는 글로 되돌리는 규칙
// 정제기(LLM)는 구조로 답하고, 기획 유저 프롬프트는 문장을 받는다. 그 사이의 변환이 여기 있다.
// 화면의 입력 예시(planComposeOptions 의 플레이스홀더)와 같은 모양이어야 한다. 사람이 그 모양으로
// 적은 것과 정제기가 만든 것이 기획 LLM 에는 같은 글로 닿아, 정제가 끼어도 프롬프트 계약이 바뀌지 않는다.

/**
 * 정제된 동영상(세그먼트) 하나. 필드는 v1.5 기획안 씬과 같은 이름이다(같은 것을 두 이름으로 부르지 않는다)
 * 말은 둘 중 하나만 채워진다(둘 다 오면 어댑터가 대화내용을 남긴다). 없으면 둘 다 빈 문자열
 */
export interface RefinedSegment {
  // 시간 표기와 단계 태그를 뺀 장면 구성. 비어 있을 수 있다(말만 적은 동영상)
  sceneComposition: string;
  // 화면 속 인물이 하는 말
  dialogue: string;
  // 화면 밖 목소리가 읽는 문장
  narration: string;
}

/** 입력 정제 결과 전체 */
export interface RefinedBrief {
  // 사용자 입력사항을 적지 않았으면 빈 배열
  segments: RefinedSegment[];
  // 한 줄에 하나. 적지 않았으면 빈 배열
  constraints: string[];
  // 정제기가 무엇을 바꿨는가(제거, 병합, 축약). 원장에 남겨 "왜 내 지시가 바뀌었나" 의 답이 된다.
  notes: string[];
}

// 화면 예시가 쓰지 않는 쪽을 이 두 글자로 적게 하고, 기획 시스템 프롬프트가 이 글자를 "없다" 로 읽는다.
const NONE = '없음';

/** 정제 결과 → 기획 유저 프롬프트에 실을 글(사용자 입력사항, 제한사항). 없는 쪽은 빈 문자열 */
export function renderRefinedBrief(refined: RefinedBrief): {
  sceneBrief: string;
  constraints: string;
} {
  const blocks = refined.segments.map((s, i) => {
    const lines = [`동영상${i + 1}:`];
    if (s.sceneComposition) lines.push(`장면 구성: ${s.sceneComposition}`);
    lines.push(`대화내용: ${s.dialogue || NONE}`);
    lines.push(`나레이션: ${s.narration || NONE}`);
    return lines.join('\n');
  });
  return {
    sceneBrief: blocks.join('\n\n'),
    constraints: refined.constraints.join('\n'),
  };
}
