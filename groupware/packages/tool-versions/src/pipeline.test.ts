// 버전 축의 값을 못박는다.
//
// 사본이 없으므로 확인할 것은 "두 곳이 같은가" 가 아니라 값 자체가 무엇인가이고, 그것은 단위
// 테스트의 일이다(소스를 정규식으로 긁어 대조하는 CI 스크립트를 이 파일이 대신한다)
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOOL_VERSION,
  TOOL_VERSIONS,
  TOOL_VERSION_PIPELINES,
  asToolVersion,
  pipelineFor,
  toolVersionOrDefault,
  type ToolVersion,
} from './index';

describe('값 공간', () => {
  it('허용 값과 표시 순서', () => {
    // 앞이 진입 기본값이자 화면 토글의 첫 항목이다.
    expect(TOOL_VERSIONS).toEqual(['v1.5', 'v1.0']);
    expect(DEFAULT_TOOL_VERSION).toBe('v1.5');
  });

  it('기본값은 목록 안에 있다', () => {
    // 밖이면 진입 자체가 모르는 버전으로 시작한다(그 워크스페이스는 어디에도 없다)
    expect(TOOL_VERSIONS).toContain(DEFAULT_TOOL_VERSION);
  });

  it('판정은 모르는 값에 null 을 준다(기본으로 접지 않는다)', () => {
    // 요청 검증이 이것을 쓴다. 접으면 버전을 빠뜨린 요청이 조용히 기본 버전의 데이터를 오간다.
    expect(asToolVersion('v1.5')).toBe('v1.5');
    for (const raw of ['v9.9', '', null, undefined, 1.5, {}]) {
      expect(asToolVersion(raw)).toBeNull();
    }
  });

  it('저장분 정규화는 모르는 값을 기본으로 접는다', () => {
    // 폐기된 버전이 저장돼 있어도 사람이 도구에 못 들어가는 일은 없어야 한다.
    expect(toolVersionOrDefault('v1.0')).toBe('v1.0');
    expect(toolVersionOrDefault('v9.9')).toBe(DEFAULT_TOOL_VERSION);
  });
});

describe('파이프라인 사실', () => {
  it('모든 버전이 모든 사실에 답한다', () => {
    // Record<ToolVersion, …> 라 컴파일도 잡지만, 값 공간을 런타임으로도 한 번 훑는다.
    //   빠진 버전이 있으면 그 워크스페이스의 서버 분기가 undefined 로 갈린다.
    for (const v of TOOL_VERSIONS) {
      const p = pipelineFor(v);
      expect(typeof p.usesSceneImages, v).toBe('boolean');
      expect(typeof p.usesFinalComposite, v).toBe('boolean');
      expect(typeof p.synthesizesSpeech, v).toBe('boolean');
      expect(p.pinnedPlanLlm === null || typeof p.pinnedPlanLlm === 'string').toBe(true);
      expect(p.briefRefinerLlm === null || typeof p.briefRefinerLlm === 'string').toBe(true);
      // 화면비는 비어 있을 수 없다. 비면 렌더가 자기 기본값으로 만들어 그 버전이 의도한 모양과
      //   다른 영상이 나오고, 그 사실은 결과를 보고서야 드러난다.
      expect(p.aspectRatio, v).toBeTruthy();
    }
    expect(Object.keys(TOOL_VERSION_PIPELINES).sort()).toEqual([...TOOL_VERSIONS].sort());
  });

  it('v1.0 = 이미지→영상: 씬 이미지와 TTS 와 세트 합성이 있다', () => {
    expect(pipelineFor('v1.0')).toEqual({
      usesSceneImages: true,
      usesFinalComposite: true,
      // 영상이 프레임 안전 구역에 앉으므로 그 자리에 맞춘 값이다(9:16 이면 자리의 30% 를 버린다)
      aspectRatio: '4:5',
      synthesizesSpeech: true,
      pinnedPlanLlm: null,
      pinnedProposalCount: null,
      briefRefinerLlm: null,
    });
  });

  it('v1.5 = 텍스트→영상: 셋 다 없고 기획 LLM 이 고정이다', () => {
    // 영상 모델이 화면과 말을 함께 만든다. 세트를 만들 에셋 화면이 없어 원천이 곧 완성본이다.
    expect(pipelineFor('v1.5')).toEqual({
      usesSceneImages: false,
      usesFinalComposite: false,
      // 영상 자체가 배포본이라 숏폼 규격을 그대로 쓴다.
      aspectRatio: '9:16',
      synthesizesSpeech: false,
      pinnedPlanLlm: 'claude-sonnet-5',
      pinnedProposalCount: 1,
      briefRefinerLlm: 'claude-sonnet-5',
    });
  });

  it('프레임 안에 앉는 버전은 숏폼 규격을 그대로 쓰지 않는다', () => {
    // 두 사실의 관계다. 최종 합성이 있으면 영상은 프레임 안의 한 자리에 앉으므로, 화면 전체
    //   규격(9:16)을 그대로 쓰면 그 자리의 절반 이상을 버린다(실측 38%). 관계가 깨지는 날 이
    //   테스트가 먼저 말한다.
    for (const v of TOOL_VERSIONS) {
      const p = pipelineFor(v);
      if (p.usesFinalComposite) expect(p.aspectRatio, v).not.toBe('9:16');
    }
  });

  it('씬 이미지를 만들지 않는 버전은 최종 합성도 하지 않는다', () => {
    // 둘의 관계가 지금의 사실이다. 갈리는 날이 오면 이 테스트가 먼저 그것을 말한다(그때는 화면의
    //   에셋 섹션과 워크스페이스 구역도 함께 정해야 한다)
    for (const v of TOOL_VERSIONS) {
      const p = pipelineFor(v);
      if (!p.usesSceneImages) expect(p.usesFinalComposite, v).toBe(false);
    }
  });

  it('고정 기획안 수는 1 이상이다', () => {
    // 0 이면 만들 것이 없고 음수는 뜻이 없다. 고정하지 않는 것은 null 로 말한다(0 이 아니다)
    for (const v of TOOL_VERSIONS) {
      const pinned: number | null = pipelineFor(v as ToolVersion).pinnedProposalCount;
      if (pinned !== null) expect(pinned, v).toBeGreaterThanOrEqual(1);
    }
  });

  it('고정 모델은 빈 문자열이 아니다', () => {
    // 빈 값이면 language-model 이 자기 카탈로그 기본으로 떨어뜨려, 아무도 고르지 않은 모델이
    //   그 버전의 기획을 쓴다(고정하기 전의 상태다). 고정하지 않는 것은 null 로 말한다.
    for (const v of TOOL_VERSIONS) {
      const pinned: string | null = pipelineFor(v as ToolVersion).pinnedPlanLlm;
      if (pinned !== null) expect(pinned.length, v).toBeGreaterThan(0);
    }
  });

  it('정제 모델도 빈 문자열이 아니다', () => {
    // 같은 이유다. 빈 값은 "정제하지 않는다" 가 아니라 "아무 모델로 정제한다" 가 된다.
    //   정제하지 않는 것은 null 로 말한다.
    for (const v of TOOL_VERSIONS) {
      const refiner: string | null = pipelineFor(v as ToolVersion).briefRefinerLlm;
      if (refiner !== null) expect(refiner.length, v).toBeGreaterThan(0);
    }
  });

  it('입력을 정제하는 버전은 기획 LLM 도 고정이다', () => {
    // 정제기가 만드는 형식은 그 버전의 기획 프롬프트가 읽는 형식이다. 기획 모델을 사람이 고르는
    //   버전에서 정제만 고정하면, 정제본을 읽는 쪽이 매번 달라져 정제의 뜻이 반쪽이 된다.
    for (const v of TOOL_VERSIONS) {
      const p = pipelineFor(v);
      if (p.briefRefinerLlm !== null) expect(p.pinnedPlanLlm, v).not.toBeNull();
    }
  });
});
