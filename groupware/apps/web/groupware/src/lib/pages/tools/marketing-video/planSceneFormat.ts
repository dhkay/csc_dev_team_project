// 기획안 씬의 형식 판정: 이 씬이 동영상(세그먼트) 형식인가, 씬 이미지 형식인가
//
// 두 형식이 있다.
//   세그먼트 형식(텍스트→영상): 장면 구성 + 대화내용. 동영상 하나가 세그먼트 하나다.
//   씬 형식(이미지→영상):     소스 방향 + 자막 + 나레이션 + 씬 이미지 브리프
//
// 버전을 묻지 않고 값을 본다. 화면마다 버전을 prop 으로 나르면 조건이 버전 수만큼 늘고, 그
//   값을 빠뜨린 화면이 다른 형식으로 그린다. 반면 어느 형식인지는 데이터 자체에 이미 적혀 있다.
//   렌더도 같은 근거를 쓴다(video-model 의 compose 가 씬 이미지 유무로 프롬프트의 뜻을 가른다)
//
// 판정 근거를 장면 구성 하나로 두는 이유: 대화내용은 말이 없는 동영상에서 비어 있을 수 있어
//   형식의 근거가 되지 못한다. 장면 구성은 그 형식에서 반드시 있다(없으면 만들 화면이 없다)

import type { PlanScene } from '$lib/features/marketing-channels/types';

/** 이 씬이 동영상(세그먼트) 형식인가 */
export function isSegmentFormat(scene: Pick<PlanScene, 'sceneComposition'>): boolean {
  return (scene.sceneComposition ?? '').trim().length > 0;
}
