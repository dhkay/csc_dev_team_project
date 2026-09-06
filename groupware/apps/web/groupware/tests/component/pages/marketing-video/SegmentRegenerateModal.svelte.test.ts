/**
 * 세그먼트 재생성 창
 *
 * 이 창이 있는 이유는 하나다: 고칠 수 없는 재생성은 같은 입력으로 같은 일을 다시 시키는 것이다.
 * 그래서 여기서 잠그는 것은 (1) 지금 값이 고칠 수 있게 들어와 있는가, (2) 시작이 그 값을 들고 가는가,
 * (3) 빈 프롬프트로 시작할 수 없는가 셋이다. 하나라도 깨지면 창은 멀쩡히 뜨는데 아무것도 바뀌지 않는다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SegmentRegenerateModal from '$lib/pages/tools/marketing-video/create/SegmentRegenerateModal.svelte';
import type { SegmentProgress } from '$lib/pages/tools/marketing-video/generationProgress';

const DONE: SegmentProgress = {
  order: 3,
  status: 'done',
  durationSec: 2,
  prompt: '카페 창가에 앉은 인물을 클로즈업으로 잡는다.',
};

function open(segment: SegmentProgress = DONE, onConfirm = vi.fn()) {
  const rendered = render(SegmentRegenerateModal, {
    open: true,
    segment,
    total: 3,
    onConfirm,
  });
  return { ...rendered, onConfirm };
}

describe('SegmentRegenerateModal', () => {
  it('무엇을 다시 만드는지와 상태를 함께 말한다', () => {
    // 격자에서 칸 하나를 눌러 들어왔으므로 그 칸이 무엇이었는지 다시 말해야 한다.
    open();
    expect(screen.getByText(/세그먼트 3/)).toBeInTheDocument();
    expect(screen.getByText('완료')).toBeInTheDocument();
  });

  it('지금 프롬프트가 값으로 들어와 고칠 수 있다', () => {
    // placeholder 로 두면 고칠 수 없고 통째로 다시 적어야 한다. 이 창의 제목은 '수정' 이다.
    open();
    const box = screen.getByLabelText('프롬프트 수정') as HTMLTextAreaElement;
    expect(box.value).toBe(DONE.prompt);
  });

  it('시작하면 고친 프롬프트를 그 세그먼트 번호와 함께 넘긴다', async () => {
    const onConfirm = vi.fn();
    open(DONE, onConfirm);
    const box = screen.getByLabelText('프롬프트 수정') as HTMLTextAreaElement;
    box.value = '  더 밝은 톤으로 다시 만든다.  ';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    screen.getByRole('button', { name: '재생성 시작' }).click();
    // 앞뒤 공백은 떼고 넘긴다(화면이 세는 값과 실제로 나가는 값이 같아야 한다)
    expect(onConfirm).toHaveBeenCalledWith(3, '더 밝은 톤으로 다시 만든다.');
  });

  it('빈 프롬프트로는 시작할 수 없다', async () => {
    // 빈 값으로 시작하면 지시 없이 다시 만들라는 것이 된다. 그건 재생성이 아니라 초기화다.
    const onConfirm = vi.fn();
    open({ ...DONE, prompt: '' }, onConfirm);
    const start = screen.getByRole('button', { name: '재생성 시작' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    start.click();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
