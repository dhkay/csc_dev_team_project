/**
 * 세트 슬롯(역할): 배경프레임(이미지) + 아웃트로(mp4) 두 개만. 세트가 각 슬롯의 바이트를
 * file-upload uploadId 로 자기완결 소유한다(별도 풀/멤버 없음)
 *   frame = 배경프레임(이미지), outro = 아웃트로(mp4 영상)
 * (BGM/샘플이미지/효과음은 세트가 아니라 별도 풀: AI 가 자동 삽입.)
 */
export const SET_SLOTS = ['frame', 'outro'] as const;
export type SetSlot = (typeof SET_SLOTS)[number];

export function isSetSlot(value: string): value is SetSlot {
  return (SET_SLOTS as readonly string[]).includes(value);
}
