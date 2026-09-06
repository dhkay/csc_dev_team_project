import { BRAND_CONCEPT_AXES } from '../../../../channel-settings/core/domain';
import { conceptLine, conceptLines, ConceptSelection } from '../brand-concept';

/**
 * 컨셉 축을 프롬프트 한 줄로 바꾸는 규칙. 축 이름이 어디서 오는지가 이 파일의 핵심이다.
 *
 * 기본 축은 카탈로그가 이름을 알지만, 세트가 스스로 더한 카테고리는 정의가 그 세트 안에만 있어
 * 카탈로그로 풀 수 없다. 그래서 선택에 이름을 실어 보내고(`axisLabel`) 그것을 먼저 쓴다. 이 폴백이
 * 빠지면 모델이 `x:1a2b3c4d: 오션 무드` 를 읽는다. 사람이 쓴 카테고리 이름이 전달되지 않는 것이라
 * 그 축의 지시가 사실상 사라진다.
 */
describe('conceptLine', () => {
  const make = (o: Partial<ConceptSelection> = {}): ConceptSelection => ({
    axis: 'mood',
    option: 'warm-cozy',
    label: '따뜻하고 아늑한',
    note: '',
    ...o,
  });

  it('기본 축은 카탈로그의 축 이름을 쓴다', () => {
    const catalogLabel = BRAND_CONCEPT_AXES.find((a) => a.key === 'mood')!.label;
    expect(conceptLine(make())).toBe(`${catalogLabel}: 따뜻하고 아늑한`);
  });

  it('감독 노트가 있으면 값 뒤에 붙인다', () => {
    expect(conceptLine(make({ note: '햇살 톤' }))).toBe('무드: 따뜻하고 아늑한, 햇살 톤');
  });

  it('커스텀 축은 선택에 실려 온 이름을 쓴다(raw key 가 프롬프트로 나가지 않는다)', () => {
    const line = conceptLine(
      make({ axis: 'x:1a2b3c4d', option: 'x:9f8e7d6c', label: '오션 무드', axisLabel: '계절감' }),
    );
    expect(line).toBe('계절감: 오션 무드');
    expect(line).not.toContain('x:');
  });

  it('실려 온 이름이 있으면 그것이 카탈로그 이름보다 앞선다', () => {
    // 기본 축에 커스텀 레퍼런스를 더한 경우에도 축 이름은 하나여야 한다(카탈로그 것)
    // 반대로 이름이 실려 왔다면 그 세트가 정한 이름이 최종이다.
    expect(conceptLine(make({ axisLabel: '내가 정한 무드' }))).toBe(
      '내가 정한 무드: 따뜻하고 아늑한',
    );
  });

  it('라벨이 없으면 빈 줄이다(문구를 못 푼 선택이 프롬프트에 실리지 않는다)', () => {
    expect(conceptLine(make({ label: '' }))).toBe('');
    expect(conceptLine(undefined)).toBe('');
  });
});

describe('conceptLines', () => {
  const pick = (axis: string, label: string, axisLabel?: string): ConceptSelection => ({
    axis,
    option: `${axis}-opt`,
    label,
    note: '',
    ...(axisLabel ? { axisLabel } : {}),
  });

  it('카탈로그 축 순서로 정렬하고 커스텀 축은 뒤에 붙인다', () => {
    // 화면의 축 순서와 프롬프트의 축 순서가 같아야 한다. 카탈로그가 그 순서의 주인이다.
    const [first, second] = BRAND_CONCEPT_AXES;
    const lines = conceptLines([
      pick('x:1a2b3c4d', '오션 무드', '계절감'),
      pick(second.key, '두번째'),
      pick(first.key, '첫번째'),
    ]);
    expect(lines).toEqual([
      `${first.label}: 첫번째`,
      `${second.label}: 두번째`,
      '계절감: 오션 무드',
    ]);
  });

  it('문구를 못 푼 선택은 목록에서 빠진다', () => {
    const lines = conceptLines([pick('mood', ''), pick('style', '있음')]);
    expect(lines).toEqual(['표현 형식: 있음']);
  });
});
