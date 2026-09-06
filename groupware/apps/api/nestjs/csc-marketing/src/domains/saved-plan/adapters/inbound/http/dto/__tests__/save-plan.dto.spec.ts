/**
 * 저장 요청 씬(DTO) → 도메인 씬 변환의 형식 규칙
 *
 * 이 경계가 검사 없이 오래 있었고, 그 사이에 실제 결함이 자랐다. 텍스트→영상 버전의 세그먼트에는
 * 연출과 자막과 이미지 브리프가 없는데 DTO 가 그 셋을 필수로 요구했고, 그래서 생성 어댑터가 빈
 * 문자열을 만들어 채워 보냈다. 빈 문자열은 "없다" 를 표현하기에 약한 신호라 읽는 쪽에서 오독이
 * 났다(그 버전 결과에 만들지도 않는 이미지의 프롬프트가 세그먼트마다 들어 있었다)
 *
 * 그래서 규칙은 하나다. 값이 없으면 키를 싣지 않는다. 아래 단정들이 그것을 양방향으로 잠근다.
 * `whitelist: true` 가 미선언 프로퍼티를 벗겨 내므로, 이 변환이 조용히 필드를 흘리면 저장본에서만
 * 드러난다(요청은 200 이다)
 */
import { toSavedPlanScenes } from '../save-plan.dto';

/** DTO 는 클래스지만 이 변환은 평범한 객체를 읽는다(검증은 파이프가 이미 끝냈다) */
const asDto = (o: Record<string, unknown>) => o as never;

describe('toSavedPlanScenes', () => {
  it('텍스트→영상 세그먼트는 이미지→영상 어휘를 얻지 않는다', () => {
    const [scene] = toSavedPlanScenes([
      asDto({
        index: 1,
        narration: '화면 밖에서 읽는 문장',
        sceneComposition: '카메라가 천천히 다가간다',
        dialogue: '이거 진짜 좋아요',
      }),
    ]);

    expect(Object.keys(scene).sort()).toEqual([
      'dialogue',
      'index',
      'narration',
      'sceneComposition',
    ]);
  });

  it('이미지→영상 씬은 자기 어휘를 그대로 지킨다', () => {
    // 이쪽이 회귀하면 v1.0 저장본에서 연출과 자막이 사라진다. 화면 상세가 그 값을 그린다.
    const [scene] = toSavedPlanScenes([
      asDto({
        index: 1,
        sourceDirection: '제품 클로즈업',
        subtitle: '지금 만나보세요',
        narration: '보습의 시작',
        imagePrompt: 'a close-up of a cream jar',
      }),
    ]);

    expect(scene).toEqual({
      index: 1,
      sourceDirection: '제품 클로즈업',
      subtitle: '지금 만나보세요',
      narration: '보습의 시작',
      imagePrompt: 'a close-up of a cream jar',
    });
  });

  it('빈 문자열로 온 어휘는 없는 것으로 정규화한다', () => {
    // 그 셋이 필수였던 시절에 저장된 세그먼트가 재저장(재렌더/복제) 경로로 다시 들어온다.
    //   그대로 통과시키면 옛 모양이 계속 번식한다.
    const [scene] = toSavedPlanScenes([
      asDto({
        index: 1,
        sourceDirection: '',
        subtitle: '',
        imagePrompt: '',
        narration: '나레이션',
        sceneComposition: '장면 구성',
      }),
    ]);

    expect(scene).toEqual({ index: 1, narration: '나레이션', sceneComposition: '장면 구성' });
  });

  it('나레이션은 두 버전 다 채우므로 늘 실린다', () => {
    // 비어 있어도 키를 뺀다면 "말이 없는 씬" 과 "이 버전에는 나레이션 개념이 없다" 가 구분되지 않는다.
    const [scene] = toSavedPlanScenes([asDto({ index: 1, narration: '' })]);
    expect(scene).toEqual({ index: 1, narration: '' });
  });
});
