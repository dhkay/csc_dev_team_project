// 프롬프트 세그먼트 SSOT: 실제로 나가는 프롬프트와 프로세스 뷰가 같은 정의에서 파생된다.
// 실제 호출은 각 세그먼트의 render(ctx), 프로세스 뷰는 같은 defs 의 template 을 씀
// 프롬프트는 한국어 한 벌이라 저장된 값이 그대로 나가고 그대로 보인다.

/** 노드 종류: 고정(계약), 작업자 편집가능, 조건부, 생성 시 런타임 주입 */
export type PromptNodeKind = 'fixed' | 'editable' | 'conditional' | 'injected';

/**
 * 프롬프트 세그먼트 정의 1개. 조립과 표시의 단일 진실원
 * Ctx 는 그 프롬프트의 실제 조립 입력(시스템, 유저, 씬이미지마다 다름)
 */
export interface PromptSegmentDef<Ctx> {
  id: string;
  // 프로세스 뷰 표시 제목(한국어)
  title: string;
  kind: PromptNodeKind;
  // 프로세스 뷰가 보여줄 값. 고정부는 실제 값, 주입부는 플레이스홀더나 예시값
  template: string;
  // '언제 들어가나' 표기. 프롬프트 본문과 별개의 화면 설명
  // 채널 상태에 따라 달라지면 함수로 줘서 그 판정이 세그먼트 정의 안에 남게 함
  note?: string | ((ctx: Ctx) => string);
  // 이 세그먼트가 참조하는 다른 세그먼트 id. 시스템 규칙 → 유저 데이터 방향으로 정의
  links?: string[];
  // 조립 시 앞에 빈 줄을 넣음(문단 구분). 뷰에는 영향 없음
  blankBefore?: boolean;
  /**
   * 실제 호출에 나갈 줄들. 빈 배열이면 이 컨텍스트에서는 프롬프트에 미포함
   * 뷰에는 그래도 남아 "언제 들어가는지"를 설명
   */
  render(ctx: Ctx): string[];
}

/**
 * 세그먼트 정의를 실제 프롬프트 문자열로 조립
 * 렌더 결과가 빈 세그먼트는 건너뛰고 blankBefore 는 앞에 빈 줄을 넣음(맨 앞은 제외)
 */
export function assembleSegments<Ctx>(
  defs: readonly PromptSegmentDef<Ctx>[],
  ctx: Ctx,
): string {
  const out: string[] = [];
  for (const def of defs) {
    const lines = def.render(ctx);
    if (lines.length === 0) continue;
    if (def.blankBefore && out.length > 0) out.push('');
    out.push(...lines);
  }
  return out.join('\n');
}

/** 이 컨텍스트에서의 note 문구. 정적 문자열이면 그대로, 함수면 평가 */
export function resolveSegmentNote<Ctx>(
  def: PromptSegmentDef<Ctx>,
  ctx: Ctx,
): string | undefined {
  return typeof def.note === 'function' ? def.note(ctx) : def.note;
}
