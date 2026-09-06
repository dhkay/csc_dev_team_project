// 세그먼트 정의를 프로세스 뷰 노드로 옮기는 방법. 두 버전이 공유한다.
// 공유해도 되는 이유: 어느 버전의 세그먼트인지 알지 못하고(배열을 인자로 받음) 버전별 파일이 넘긴다.
import type { PromptSegmentDef } from '../prompt-segment';
import { resolveSegmentNote } from '../prompt-segment';
import type { PromptNode, VideoModelPromptDescriptor } from './types';

/** 세그먼트 정의를 프로세스 뷰 노드로 변환. 원문과 링크는 정의가 가진 값을 그대로 사용 */
export function toNode<Ctx>(def: PromptSegmentDef<Ctx>, ctx: Ctx): PromptNode {
  const node: PromptNode = {
    id: def.id,
    title: def.title,
    kind: def.kind,
    content: def.template,
  };
  const note = resolveSegmentNote(def, ctx);
  if (note) node.note = note;
  if (def.links && def.links.length > 0) node.links = [...def.links];
  return node;
}

/** 세그먼트 정의 배열을 노드 배열로 변환 */
export function toNodes<Ctx>(defs: readonly PromptSegmentDef<Ctx>[], ctx: Ctx): PromptNode[] {
  return defs.map((def) => toNode(def, ctx));
}

// video-model 서술을 못 받아왔을 때의 폴백. 화면이 비지 않게만 하고 원문의 주인은 video-model
export const SCENE_MOTION_FALLBACK: VideoModelPromptDescriptor['sceneMotion'] = {
  content: '은은한 자연스러운 모션, 부드러운 카메라 움직임, 시네마틱, 고품질',
};

// 대사 지시 폴백. 위와 같은 성격
export const SCENE_DIALOGUE_FALLBACK = {
  content:
    '화면 속 인물이 또렷한 한국어로 다음 대사를 말한다: "{line}". 입 모양을 대사에 정확히 맞춘다.',
};

// 나레이션 지시 폴백. 위와 같음
export const SCENE_NARRATION_FALLBACK = {
  content:
    '화면 밖 목소리가 또렷한 한국어로 다음 문장을 읽는다: "{line}". 이 문장은 화면 속 인물이 말하지 않는다.',
};
