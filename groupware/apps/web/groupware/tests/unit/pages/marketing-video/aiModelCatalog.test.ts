import { describe, it, expect } from 'vitest';
import {
  AI_CAPABILITIES,
  AI_MODEL_DEFAULTS,
  aiModelDefaults,
  describeAiModel,
  effectiveAiModel,
  findAiModelOption,
  isAiModelVisible,
  isModelComingSoon,
  pinnedModelFor,
  visibleAiCapabilities,
  visibleAiModelOptions,
} from '$lib/pages/tools/marketing-video/aiModelOptions';
import { VERSION_MODES } from '$lib/shared/lib/versionMode/versionMode';

/**
 * AI 모델 카탈로그의 버전 축
 *
 * 노출(어떤 모델을 고를 수 있는가)과 기본(고르지 않으면 무엇인가)이 같은 버전 판정을 봐야 한다.
 * 어긋나면 설정 화면이 조용히 깨진다: 목록에 없는 모델이 기본이면 그 역량은 아무것도 고르지 않은
 * 것처럼 보이고(빈 화면), 반대로 감춘 모델이 가격표에만 남으면 두 화면이 서로 다른 말을 한다.
 */
describe('AI 모델 카탈로그의 버전 축', () => {
  it('v1.5 에는 씬 이미지 역량이 없고, LLM 은 있되 고정이다', () => {
    // 씬 이미지는 없다: Higgsfield 영상 모델의 텍스트 인코더가 텍스트에서 바로 영상을 만든다.
    //
    // LLM 은 있다. 그 버전에도 기획 호출이 나가고 돈이 청구된다(텍스트 인코더는 문장 하나를 클립
    //   하나로 바꿀 뿐, 씬을 몇 개로 나눌지와 각 씬의 장면 구성과 대화내용은 정하지 못한다)
    //   축에서 빼면 그 지출이 가격표에서 사라지고 준비상태도 그 키를 요구하지 않는다.
    //   고를 수 없다는 것은 `pinnedByVersion` 이 말한다.
    expect(visibleAiCapabilities('v1.5').map((c) => c.key)).toEqual(['llm', 'video']);
    expect(visibleAiCapabilities('v1.0').map((c) => c.key)).toEqual(['llm', 'video', 'image', 'tts']);
  });

  it('v1.5 의 LLM 은 고정이라 고를 선택지가 하나뿐이다', () => {
    // 고정 역량은 그 모델 하나만 내놓는다. 나머지를 함께 보여주면 가격표가 그 버전에서 고를 수도
    //   쓸 수도 없는 모델의 단가를 견주게 하고, 설정 화면은 눌러도 아무 일 없는 자리를 만든다.
    const llm = AI_CAPABILITIES.find((c) => c.key === 'llm')!;
    expect(pinnedModelFor(llm, 'v1.5')).toBe('claude-sonnet-5');
    expect(pinnedModelFor(llm, 'v1.0')).toBeNull();
    expect(visibleAiModelOptions(llm, 'v1.5').map((o) => o.key)).toEqual(['claude-sonnet-5']);
    expect(visibleAiModelOptions(llm, 'v1.0').length).toBeGreaterThan(1);
  });

  it('그 버전의 역량에는 고를 수 있는 모델이 최소 하나 있다', () => {
    // 역량은 있는데 선택지가 없으면 화면이 "준비중" 으로 보인다. 쓰지 않기로 한 단계는 역량 축에서
    // 빼야 하고(위 검사), 쓰는 단계에는 고를 것이 있어야 한다.
    for (const version of VERSION_MODES) {
      for (const cap of visibleAiCapabilities(version)) {
        expect(
          visibleAiModelOptions(cap, version).length,
          `${version}/${cap.key}: 이 버전이 쓰는 역량인데 고를 모델이 없다`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('모델이 노출을 주장하는 버전에는 그 역량이 있어야 한다', () => {
    // 역량이 없는 버전을 모델이 가리키면 그 선언은 아무 효과가 없다(역량 축이 먼저 걸러낸다)
    // 읽는 사람에게는 "그 버전에서 쓴다" 로 보이므로 카탈로그가 거짓을 말하게 된다.
    for (const cap of AI_CAPABILITIES) {
      const capVersions = cap.versions ?? VERSION_MODES;
      for (const opt of cap.options) {
        for (const v of opt.versions ?? []) {
          expect(capVersions, `${cap.key}/${opt.key}: 역량이 없는 ${v} 를 가리킨다`).toContain(v);
        }
      }
    }
  });

  it('어느 버전도 쓰지 않는 모델은 어디에도 노출되지 않는다', () => {
    // 배선과 단가 카드는 남기고 노출만 끈 모델들. 되살릴 때는 versions 에 그 버전을 적는다.
    for (const version of VERSION_MODES) {
      const keys = AI_CAPABILITIES.flatMap((cap) =>
        visibleAiModelOptions(cap, version).map((o) => o.key),
      );
      expect(keys, version).not.toContain('wan2.2-ti2v-5b');
      expect(keys, version).not.toContain('flux-schnell');
      expect(keys, version).not.toContain('internal-qwen3');
    }
  });

  // 두 검사 모두 위반 목록을 모아 한 번에 단언한다. 지금은 어느 버전에도 기본이 없어
  // 반복문 안에서만 단언하면 아무것도 검사하지 않은 채 통과한다(vitest requireAssertions 가
  // 그 빈 통과를 실패로 잡아 준다). 기본이 다시 생기는 날 이 규칙이 그대로 작동해야 한다.
  it('준비중 모델은 목록에 남지만 실효 모델로는 쓰이지 않는다', () => {
    // 목록에서 감추지 않는 이유는 카탈로그 주석에 있다(열리는 날 한 줄로 되살아난다)
    //   그러나 저장돼 있더라도 쓰지 않는다: 그대로 렌더하면 벤더가 거절한다.
    for (const version of VERSION_MODES) {
      for (const cap of visibleAiCapabilities(version)) {
        for (const opt of visibleAiModelOptions(cap, version)) {
          if (!isModelComingSoon(opt)) continue;
          expect(effectiveAiModel(cap.key, opt.key, version)).not.toBe(opt.key);
        }
      }
    }
  });

  it('그 버전의 역량에는 준비중이 아닌 모델이 최소 하나 있다', () => {
    // 전부 준비중이면 그 역량은 고를 수 있는 것이 없어 생성이 영구히 막힌다. 그 상태는 화면에서
    //   "목록은 있는데 다 눌리지 않는다" 로만 드러나므로 여기서 잡는다.
    for (const version of VERSION_MODES) {
      for (const cap of visibleAiCapabilities(version)) {
        const options = visibleAiModelOptions(cap, version);
        if (options.length === 0) continue; // 빈 역량은 다른 테스트가 다룬다
        expect(options.some((o) => !isModelComingSoon(o))).toBe(true);
      }
    }
  });

  it('기본 모델을 두는 역량은 그 버전에서 고를 수 있는 모델을 가리킨다', () => {
    const violations: string[] = [];
    for (const version of VERSION_MODES) {
      const defaults = aiModelDefaults(version);
      for (const cap of AI_CAPABILITIES) {
        const key = defaults[cap.key];
        if (key === undefined) continue;
        const opt = findAiModelOption(cap.key, key);
        if (!opt) violations.push(`${version}/${cap.key}: 기본 key(${key})가 카탈로그에 없다`);
        else if (!isAiModelVisible(opt, version))
          violations.push(`${version}/${cap.key}: 기본 모델(${key})이 이 버전 목록에 없다`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('기본 모델은 조직 API 키를 요구하지 않는다', () => {
    // 이 규칙이 두 버전의 기본 구성을 한 문장으로 설명한다. 키가 필요한 모델을 기본으로 두면
    // "고르지 않아도 이걸로 만들어진다" 가 거짓이 된다(키 없는 조직에서는 그 기본도 못 쓴다)
    // 지금은 두 버전 다 남은 역량이 전부 키를 요구해 기본이 하나도 없다.
    const violations: string[] = [];
    for (const version of VERSION_MODES) {
      for (const [cap, key] of Object.entries(aiModelDefaults(version))) {
        const opt = findAiModelOption(cap as never, key as string);
        if (opt?.credentialProvider)
          violations.push(`${version}/${cap}: 기본 모델(${key})이 조직 키를 요구한다`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('두 버전 다 기본 모델이 없다: 고르지 않으면 생성 전 점검이 막는다', () => {
    expect(Object.keys(aiModelDefaults('v1.0'))).toEqual([]);
    expect(Object.keys(aiModelDefaults('v1.5'))).toEqual([]);
  });

  it('실효 모델은 저장값 → 버전 기본 → 없음 순으로 정해진다', () => {
    // 설정 화면의 "무엇이 선택돼 보이는가" 와 생성 전 점검의 "무엇이 비었는가" 가 이 함수 하나를 본다.
    expect(effectiveAiModel('llm', 'claude-sonnet-5', 'v1.0')).toBe('claude-sonnet-5');
    // 그 버전이 쓰지 않는 모델이 저장돼 있으면 고르지 않은 것으로 본다(그 모델로 만들지 않기 위해)
    expect(effectiveAiModel('llm', 'internal-qwen3', 'v1.0')).toBeNull();
    // 기본이 없으므로 고른 적 없으면 null 이다.
    expect(effectiveAiModel('llm', '', 'v1.0')).toBeNull();
    expect(effectiveAiModel('video', '', 'v1.5')).toBeNull();
  });

  it('감춘 모델도 이름은 그대로 읽힌다', () => {
    // 다른 버전에서 만든 산출물의 모델 이름을 보여줘야 한다(카드의 "생성 AI" 팝오버)
    // 그래서 조회 함수는 버전 축을 보지 않는다.
    expect(findAiModelOption('llm', 'internal-qwen3')).toBeTruthy();
    expect(describeAiModel('video', 'wan2.2-ti2v-5b').label).toBe('자체 영상 생성 (Wan 2.2)');
  });

  it('버전별 기본이 카탈로그 상수 하나에서 온다', () => {
    // 화면마다 기본을 따로 계산하면(설정과 가격표) 배지가 서로 다른 모델에 붙는다.
    for (const version of VERSION_MODES) {
      expect(aiModelDefaults(version)).toBe(AI_MODEL_DEFAULTS[version]);
    }
  });
});

/**
 * 나레이션 음성은 이 카탈로그가 아니라 조직 API 등록에 있다.
 *
 * ElevenLabs 는 음성을 요청 경로로 받으므로(POST /v1/text-to-speech/{voice_id}) 없으면 한 번도
 * 호출할 수 없다. 그래서 음성은 "무엇으로 만들까"(개인 설정)가 아니라 "이 조직이 이 벤더를 쓸 수
 * 있는가"(조직 자격증명) 쪽이고, 미등록은 credentialProvider 게이팅이 덮는다. 그 배선이 끊기면
 * 키도 음성도 없는 조직에서 모델이 선택 가능해 보인다.
 */
describe('나레이션 모델의 자격증명 배선', () => {
  const ttsOptions = (version: (typeof VERSION_MODES)[number]) => {
    const cap = visibleAiCapabilities(version).find((c) => c.key === 'tts');
    return cap ? visibleAiModelOptions(cap, version) : [];
  };

  it('나레이션 역량은 합성 단계가 있는 버전에만 있다', () => {
    // 텍스트→영상은 영상 모델이 말까지 만들어 합성 단계가 없다. 그 버전에 이 역량을 남기면 고른
    //   모델이 어디에도 쓰이지 않으면서 가격표에 줄을 만들고, 준비상태가 있지도 않은 키를 요구한다.
    expect(ttsOptions('v1.5')).toEqual([]);
    expect(ttsOptions('v1.0').length).toBeGreaterThan(0);
  });

  it('edge-tts 는 아무 키도 요구하지 않는다', () => {
    // 무료라 등록할 것이 없고, 음성은 카탈로그가 목록으로 들고 있다.
    expect(findAiModelOption('tts', 'edge-tts')?.credentialProvider).toBeUndefined();
  });
});