import { renderRefinedBrief, type RefinedBrief } from '../brief-refinement';

/**
 * 정제 결과 → 기획 유저 프롬프트 글
 *
 * 이 글의 모양이 화면의 입력 예시(planComposeOptions 의 플레이스홀더)와 같아야 한다. 사람이 그
 * 모양으로 적은 것과 정제기가 만든 것이 기획 LLM 에 같은 글로 닿아야 정제가 끼어도 프롬프트 계약이
 * 바뀌지 않는다. 그리고 그 시스템 프롬프트가 "없음" 을 말이 없다는 뜻으로 읽으므로 쓰지 않는 쪽은
 * 그 두 글자로 적는다.
 */
describe('renderRefinedBrief', () => {
  const base: RefinedBrief = { segments: [], constraints: [], notes: [] };

  it('동영상마다 번호, 장면 구성, 대화내용, 나레이션 네 줄이고 쓰지 않는 말은 없음이다', () => {
    const { sceneBrief } = renderRefinedBrief({
      ...base,
      segments: [
        {
          sceneComposition: '욕조에 물을 받는 부모의 손 클로즈업',
          dialogue: '',
          narration: '이사하면, 목욕물도 달라질까요',
        },
        { sceneComposition: '제품이 물에 닿는 순간', dialogue: '이거 하나면 끝나요', narration: '' },
      ],
    });
    expect(sceneBrief).toBe(
      [
        '동영상1:',
        '장면 구성: 욕조에 물을 받는 부모의 손 클로즈업',
        '대화내용: 없음',
        '나레이션: 이사하면, 목욕물도 달라질까요',
        '',
        '동영상2:',
        '장면 구성: 제품이 물에 닿는 순간',
        '대화내용: 이거 하나면 끝나요',
        '나레이션: 없음',
      ].join('\n'),
    );
  });

  it('번호는 배열 순서다(정제기가 준 번호를 받지 않는다)', () => {
    // 번호가 띄어 매겨지면 화면의 셈과 기획 프롬프트의 개수 지시가 어긋난다. 그래서 구조에 번호
    //   자리가 없고 순서가 곧 번호다.
    const { sceneBrief } = renderRefinedBrief({
      ...base,
      segments: [
        { sceneComposition: 'a', dialogue: '', narration: '' },
        { sceneComposition: 'b', dialogue: '', narration: '' },
      ],
    });
    expect(sceneBrief.match(/^동영상\d+:$/gm)).toEqual(['동영상1:', '동영상2:']);
  });

  it('말이 없는 동영상은 두 줄이 다 없음이고, 장면 구성이 없으면 그 줄을 빼되 번호는 남긴다', () => {
    const { sceneBrief } = renderRefinedBrief({
      ...base,
      segments: [
        { sceneComposition: '제품 컷', dialogue: '', narration: '' },
        { sceneComposition: '', dialogue: '', narration: '마무리' },
      ],
    });
    expect(sceneBrief).toContain('동영상1:\n장면 구성: 제품 컷\n대화내용: 없음\n나레이션: 없음');
    expect(sceneBrief).toContain('동영상2:\n대화내용: 없음\n나레이션: 마무리');
  });

  it('제한사항은 한 줄에 하나로 잇고, 없는 쪽은 빈 문자열이다', () => {
    // 빈 문자열이어야 기획 유저 프롬프트의 조건부 절이 빠진다(빈 절은 모델이 채울 자리로 읽힌다)
    const rendered = renderRefinedBrief({
      ...base,
      constraints: ['아이 얼굴 클로즈업 금지', '실사 질감 유지'],
    });
    expect(rendered.constraints).toBe('아이 얼굴 클로즈업 금지\n실사 질감 유지');
    expect(rendered.sceneBrief).toBe('');
    expect(renderRefinedBrief(base)).toEqual({ sceneBrief: '', constraints: '' });
  });
});
