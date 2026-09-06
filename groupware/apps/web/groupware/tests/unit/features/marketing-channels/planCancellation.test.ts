/**
 * 기획안 배치 취소 테스트
 *
 * 씬 이미지는 배치당 여러 개가 동시에 돈다. 설정/과금 사유로 막히면 전부 같은 이유로 실패한다.
 * 그때 (1) 알림이 씬 수만큼 쌓이지 않고, (2) 타일이 화면에서 걷히고, (3) 남은 생성이 중단되는지 고정한다.
 * 하나라도 깨지면 사용자는 살릴 수 없는 반쪽 기획안 앞에서 헛된 재시도를 반복한다.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cancelPlanBatch } from '$lib/features/marketing-channels/lib/planCancellation';
import {
  MODEL_SETUP_REQUIRED,
  MarketingApiError,
  isModelSetupError
} from '$lib/features/marketing-channels/lib/modelSetupError';
import type { PlanProposal } from '$lib/features/marketing-channels/types';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import { planSceneImagesStore } from '$lib/shared/lib/stores/planSceneImagesStore/planSceneImagesStore.svelte';

const proposal = (id: string): PlanProposal =>
  ({
    id,
    title: `기획안 ${id}`,
    scenes: [
      { index: 0, imagePrompt: 'a' },
      { index: 1, imagePrompt: 'b' }
    ]
  }) as unknown as PlanProposal;

/** 배치마다 새 id: 스토어는 싱글톤이라 테스트가 서로의 removed 집합을 보지 않게 한다. */
let nextBatchId = 1;

describe('modelSetupError', () => {
  it('설정/과금 코드를 실패 봉투와 던져진 에러 양쪽에서 알아본다', () => {
    expect(isModelSetupError({ success: false, errorCode: MODEL_SETUP_REQUIRED })).toBe(true);
    expect(isModelSetupError(new MarketingApiError('한도 초과', MODEL_SETUP_REQUIRED))).toBe(true);
  });

  it('그 외 실패는 재시도 가능으로 본다. 일시적 실패에 조치 안내를 강요하지 않게', () => {
    expect(isModelSetupError({ success: false, error: '엔진 혼잡' })).toBe(false);
    expect(isModelSetupError(new Error('네트워크'))).toBe(false);
    expect(isModelSetupError(undefined)).toBe(false);
    expect(isModelSetupError('MODEL_SETUP_REQUIRED')).toBe(false); // 문자열 자체는 봉투가 아니다
  });
});

describe('cancelPlanBatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastStore.clear();
    nextBatchId += 1;
  });

  afterEach(() => {
    toastStore.clear();
    vi.useRealTimers();
  });

  it('타일을 걷어내고 사유를 알린다. 서버 문구를 그대로 쓴다', () => {
    const batchId = nextBatchId;
    const plans = [proposal('p1'), proposal('p2')];

    cancelPlanBatch(batchId, plans, '외부 이미지 모델 사용 한도를 초과했습니다(결제 한도).');

    // 화면에서 걷힘 = 자동 저장도 차단(저장은 모든 씬 성공이 조건이고, 제거된 기획안은 대상에서 빠진다)
    expect(plans.every((p) => planSceneImagesStore.isRemoved(batchId, p.id))).toBe(true);
    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].variant).toBe('error');
    expect(toastStore.items[0].detail).toContain('결제 한도');
  });

  it('여러 씬이 같은 사유로 실패해도 알림은 하나다(멱등)', () => {
    const batchId = nextBatchId;
    const plans = [proposal('p1')];

    cancelPlanBatch(batchId, plans, '키 미등록');
    cancelPlanBatch(batchId, plans, '키 미등록');
    cancelPlanBatch(batchId, plans, '키 미등록');

    expect(toastStore.items).toHaveLength(1);
    // 횟수 표기도 늘지 않아야 한다. 실패는 하나의 사건이다(씬 수가 아니다)
    expect(toastStore.items[0].count).toBe(1);
  });

  it('사유가 비면 기본 안내로 대체한다. 빈 알림을 띄우지 않는다', () => {
    cancelPlanBatch(nextBatchId, [proposal('p1')], '   ');
    expect(toastStore.items[0].detail).toContain('환경설정');
  });

  it('이미 사용자가 다 지운 배치는 알리지 않는다. 버린 작업의 취소는 소식이 아니다', () => {
    const batchId = nextBatchId;
    const plans = [proposal('p1')];
    planSceneImagesStore.remove(batchId, plans[0]);

    cancelPlanBatch(batchId, plans, '한도 초과');
    expect(toastStore.items).toHaveLength(0);
  });

  it('기획안이 아직 없으면 아무것도 하지 않는다', () => {
    // 텍스트 생성 중인 배치의 취소는 이 함수의 일이 아니다(취소 사가가 가져갔다). 그때 여기로 오면
    //   걷어낼 씬도 알릴 사유도 없다.
    cancelPlanBatch(nextBatchId, [], '한도 초과');
    expect(toastStore.items).toHaveLength(0);
  });
});
