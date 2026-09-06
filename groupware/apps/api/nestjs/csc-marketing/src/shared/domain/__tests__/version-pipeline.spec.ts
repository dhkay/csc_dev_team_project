/**
 * 버전 파생 규칙 둘: 저장값과 그 버전의 사실 중 무엇이 이기는가
 *
 * 값은 커널(`@csc/tool-versions`)이 소유하고 그 표는 자기 스펙이 지킨다. 여기서 지키는 것은
 * 이 서버가 그 표를 어느 방향으로 읽는가다.
 *
 * 규칙을 서비스 안의 지역 함수로 두면 검사가 생성기 컨텍스트에 실린 값을 보는 간접 방식이 된다.
 * 씬 이미지가 없는 버전의 프롬프트에는 안전 제약 자리가 애초에 없어, 마스킹이 깨져도 프롬프트가
 * 똑같이 보이고 그 간접 검사는 공허해진다. 그래서 규칙을 밖으로 내고 규칙 자체를 검사한다.
 */
import { TOOL_VERSIONS } from '../tool-version';
import {
  imageModelForVersion,
  pipelineFor,
  planLlmForVersion,
  proposalCountForVersion,
} from '../version-pipeline';

describe('planLlmForVersion', () => {
  it('고정 모델이 있는 버전은 저장값을 보지 않는다', () => {
    const pinned = TOOL_VERSIONS.filter((v) => pipelineFor(v).pinnedPlanLlm !== null);
    expect(pinned.length).toBeGreaterThan(0); // 고정하는 버전이 하나는 있다(없으면 이 규칙이 죽는다)
    for (const version of pinned) {
      // 저장값이 무엇이든(옛 선택이 남아 있어도) 고정값이 이긴다.
      expect(planLlmForVersion(version, 'internal-qwen3')).toBe(
        pipelineFor(version).pinnedPlanLlm,
      );
      expect(planLlmForVersion(version, '')).toBe(pipelineFor(version).pinnedPlanLlm);
    }
  });

  it('고정 모델이 없는 버전은 저장값을 그대로 쓴다', () => {
    const free = TOOL_VERSIONS.filter((v) => pipelineFor(v).pinnedPlanLlm === null);
    expect(free.length).toBeGreaterThan(0);
    for (const version of free) {
      expect(planLlmForVersion(version, 'claude-opus-4-8')).toBe('claude-opus-4-8');
      // 빈 값도 그대로 넘긴다: 그때 무엇을 쓸지는 language-model 의 기본이 정한다.
      expect(planLlmForVersion(version, '')).toBe('');
    }
  });
});

describe('imageModelForVersion', () => {
  it('씬 이미지를 만드는 버전은 저장값을 그대로 쓴다', () => {
    const withImages = TOOL_VERSIONS.filter((v) => pipelineFor(v).usesSceneImages);
    expect(withImages.length).toBeGreaterThan(0);
    for (const version of withImages) {
      expect(imageModelForVersion(version, 'gpt-image-2')).toBe('gpt-image-2');
    }
  });

  it('씬 이미지를 만들지 않는 버전은 저장값이 남아 있어도 없는 것으로 본다', () => {
    // 옛 선택이 슬롯에 남아 있을 수 있다(그 버전에서 이미지 단계를 걷어내기 전에 고른 값)
    //   그것으로 프롬프트를 좁히면 만들지도 않는 이미지의 벤더 제약이 문안에 걸리고, 그 사실은
    //   결과물을 읽어야 드러난다.
    const withoutImages = TOOL_VERSIONS.filter((v) => !pipelineFor(v).usesSceneImages);
    expect(withoutImages.length).toBeGreaterThan(0);
    for (const version of withoutImages) {
      expect(imageModelForVersion(version, 'gpt-image-2')).toBe('');
    }
  });

  it('모든 버전에서 빈 저장값은 빈 값으로 남는다', () => {
    // 마스킹은 값을 지우는 일이지 만드는 일이 아니다. 기본 모델을 여기서 채우면 화면이 말한 적
    //   없는 벤더의 제약이 프롬프트에 들어간다.
    for (const version of TOOL_VERSIONS) {
      expect(imageModelForVersion(version, '')).toBe('');
    }
  });
});

describe('proposalCountForVersion', () => {
  it('고정하는 버전은 요청값을 보지 않는다', () => {
    const pinned = TOOL_VERSIONS.filter((v) => pipelineFor(v).pinnedProposalCount !== null);
    expect(pinned.length).toBeGreaterThan(0);
    for (const version of pinned) {
      const count = pipelineFor(version).pinnedProposalCount;
      // 무엇을 보내도 같은 수가 나온다. 낡은 탭이나 직접 호출이 6을 보내도 예산과 파싱 상한이
      //   함께 부풀지 않는다(그 요금은 실제로 나간다)
      for (const requested of [1, 3, 6, 999]) {
        expect(proposalCountForVersion(version, requested)).toBe(count);
      }
    }
  });

  it('고정하지 않는 버전은 요청값을 그대로 쓴다', () => {
    const free = TOOL_VERSIONS.filter((v) => pipelineFor(v).pinnedProposalCount === null);
    expect(free.length).toBeGreaterThan(0);
    for (const version of free) {
      // 범위 방어(clamp)는 호출부가 먼저 한다. 이 규칙은 "그 버전이 고르게 하는가" 만 답한다.
      expect(proposalCountForVersion(version, 3)).toBe(3);
      expect(proposalCountForVersion(version, 6)).toBe(6);
    }
  });
});
