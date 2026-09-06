import { PLAN_USER_SEGMENTS, buildPlanUserPrompt } from '../user';
import type { PlanUserPromptContext } from '../../context';
import { assembleSegments } from '../../../prompt-segment';

/**
 * 유저 프롬프트는 LLM 출력 계약의 절반(섹션 라벨과 순서를 모델이 읽는다)이라, 조립 결과를
 * 한 글자까지 고정한다. 세그먼트를 추가/재배치하면 이 골든이 깨져 의도한 변경인지 검토하게 된다.
 */
describe('buildPlanUserPrompt', () => {
  function makeContext(overrides: Partial<PlanUserPromptContext> = {}): PlanUserPromptContext {
    return {
      channelName: '유튜브',
      brand: {
        name: '촉촉연구소',
        description: '보습 전문 브랜드',
        concepts: [
          { axis: 'style', option: 'live-action-closeup', label: '실사 클로즈업 필름룩', note: '아기 피부, 물방울을 근접 촬영, 연약함 강조' },
          { axis: 'mood', option: 'warm-cozy', label: '웜 & 코지(따뜻한 자연광)', note: '노을빛, 주광의 포근한 가정 분위기' },
        ],
      },
      purposeKeywords: ['수분크림', '보습'],
      // 기본은 미입력이다(선택 항목). 적었을 때의 골든은 아래 전용 케이스가 본다.
      sceneBrief: '',
      constraints: '',
      bgmCandidates: [{ id: 7, name: '잔잔한 피아노', tags: [{ axisKey: 'mood', value: 'calm' }] }],
      sfxCandidates: [],
      proposalCount: 3,
      ...overrides,
    };
  }

  it('섹션을 빈 줄로 구분해 조립 순서대로 이어붙인다', () => {
    expect(buildPlanUserPrompt(makeContext())).toBe(
      [
        '채널: 유튜브',
        '',
        '[브랜드와 컨셉]',
        '브랜드명: 촉촉연구소',
        '브랜드 설명: 보습 전문 브랜드',
        '표현 형식: 실사 클로즈업 필름룩, 아기 피부, 물방울을 근접 촬영, 연약함 강조',
        '무드: 웜 & 코지(따뜻한 자연광), 노을빛, 주광의 포근한 가정 분위기',
        '',
        '[목적 키워드]',
        '수분크림, 보습',
        '',
        '[사용 가능한 BGM] (기획안 전체에 쓸 하나를 id 로 고른다)',
        '7 | 잔잔한 피아노 | mood=calm',
        '',
        '[사용 가능한 효과음] (씬마다 선택적으로 id 로 배치, offsetSec 지정)',
        '(없음)',
        '',
        '위 목적 키워드를 중심으로(브랜드는 절제하고 자연스럽게 녹여), ' +
          '정확히 3개의 서로 다른 마케팅 영상 기획안을 JSON 배열로만 출력한다.',
      ].join('\n'),
    );
  });

  it('수집 데이터 섹션은 아예 없다(수집은 키워드 단계에서 끝난다)', () => {
    // 프롬프트가 수집 데이터를 싣던 시절의 잔재 방지: 그 자리에 빈 줄도 남지 않아야 한다.
    const prompt = buildPlanUserPrompt(makeContext());
    expect(prompt).not.toContain('[수집 데이터]');
    expect(prompt).toContain(
      '[목적 키워드]\n수분크림, 보습\n\n[사용 가능한 BGM] (기획안 전체에 쓸 하나를 id 로 고른다)',
    );
  });

  it('값이 비면 플레이스홀더로 대체한다((지정 안 함) / (없음))', () => {
    const prompt = buildPlanUserPrompt(
      makeContext({
        channelName: '',
        brand: { name: '', description: '', concepts: [] },
        purposeKeywords: [],
        bgmCandidates: [],
      }),
    );
    expect(prompt).toContain('채널: (지정 안 함)');
    expect(prompt).toContain('브랜드명: (지정 안 함)');
    // 라벨 줄로 확인한다. 최종 지시에도 '브랜드 설명' 이라는 말이 들어가므로(키워드 없이 생성할 때
    //   중심을 가리키는 문구) 맨 낱말로 찾으면 그 문장에 걸린다.
    expect(prompt).not.toContain('브랜드 설명:');
    expect(prompt).toContain('[사용 가능한 BGM] (기획안 전체에 쓸 하나를 id 로 고른다)\n(없음)');
  });

  it('목적 키워드가 없으면 그 절을 빼고, 최종 지시의 중심을 브랜드로 바꾼다', () => {
    // 목적 키워드는 선택이다. 없을 때 '(없음)' 을 적어 두면 모델이 채워야 할 빈자리로 읽고,
    //   '목적 키워드를 중심으로' 라는 최종 지시는 중심이 없는 지시가 된다(시스템 프롬프트의 주제
    //   지시도 같은 이유로 브랜드 쪽으로 갈린다: plan-prompt 의 BRAND_SUBJECT_DIRECTIVE)
    const prompt = buildPlanUserPrompt(makeContext({ purposeKeywords: [] }));
    expect(prompt).not.toContain('[목적 키워드]');
    expect(prompt).toContain('위 브랜드와 브랜드 설명을 중심으로');
    expect(prompt).not.toContain('위 목적 키워드를 중심으로');
    // 절이 빠진 자리에 빈 줄이 남지 않는다(섹션 사이는 빈 줄 하나가 전부다)
    expect(prompt).not.toContain('\n\n\n');
  });

  it('사용자 입력사항은 적었을 때만 그 절이 들어가고, 목적 키워드 뒤에 온다', () => {
    // 선택 항목이라 빈 칸을 남기지 않는다(목적 키워드와 같은 이유: 빈자리는 채울 곳으로 읽힌다)
    // 순서가 중요하다. 키워드가 주제를 정하고 이 지시가 그 주제를 어떻게 담을지 말하는 순서라야,
    //   뒤의 지시가 앞의 내용을 구체화하는 것으로 읽힌다.
    const written = buildPlanUserPrompt(
      makeContext({ sceneBrief: '씬1: 목욕 후 장면\n씬2: 미스트 클로즈업' }),
    );
    expect(written).toContain('[사용자 입력사항]');
    expect(written).toContain('씬2: 미스트 클로즈업');
    expect(written.indexOf('[목적 키워드]')).toBeLessThan(written.indexOf('[사용자 입력사항]'));

    const blank = buildPlanUserPrompt(makeContext({ sceneBrief: '' }));
    expect(blank).not.toContain('[사용자 입력사항]');
    // 절이 빠진 자리에 빈 줄이 남지 않는다.
    expect(blank).not.toContain('\n\n\n');
  });

  it('제한사항은 사용자 입력사항 바로 뒤에 붙는다', () => {
    // "이렇게 만들되 이건 피하라" 가 한 덩어리로 읽혀야 한다. 사이에 BGM 후보 같은 절이 끼면
    //   제한이 무엇에 걸리는 말인지 흐려진다.
    const prompt = buildPlanUserPrompt(
      makeContext({ sceneBrief: '씬1: 목욕 후 장면', constraints: '실사 질감 유지' }),
    );
    expect(prompt).toContain('[사용자 입력사항]\n씬1: 목욕 후 장면\n\n[제한사항]\n실사 질감 유지');

    // 씬 입력 없이 제한사항만 적어도 들어간다(둘은 각자 선택이다)
    const onlyLimits = buildPlanUserPrompt(makeContext({ constraints: '실사 질감 유지' }));
    expect(onlyLimits).toContain('[제한사항]');

    const blank = buildPlanUserPrompt(makeContext({ constraints: '' }));
    expect(blank).not.toContain('[제한사항]');
    expect(blank).not.toContain('\n\n\n');
  });

  it('실제 프롬프트가 세그먼트 정의에서 파생된다(어떤 세그먼트도 조립에서 누락되지 않는다)', () => {
    const ctx = makeContext();
    // 조립 = 세그먼트 렌더의 이어붙임. 정의를 우회한 문자열이 섞이지 않는다.
    expect(buildPlanUserPrompt(ctx)).toBe(assembleSegments(PLAN_USER_SEGMENTS, ctx));
    // 각 세그먼트가 실제로 결과에 실린다(정의만 해두고 조립에서 빠지는 사고 방지)
    for (const seg of PLAN_USER_SEGMENTS) {
      for (const line of seg.render(ctx)) {
        if (line.length > 0) expect(buildPlanUserPrompt(ctx)).toContain(line);
      }
    }
  });
});
