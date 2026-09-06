import { describe, expect, it } from 'vitest';
import {
  STORAGE_MAX_PAGE_SIZE,
  STORAGE_PAGE_STEP,
  clampPageSize
} from '$lib/features/storage/lib/paging';

describe('clampPageSize', () => {
  it('상한을 넘기지 않는다', () => {
    // 넘겨 보내면 서버 스키마(le=200)가 422 로 거절한다. 그 사고를 여기서 막는다.
    expect(clampPageSize(1000)).toBe(STORAGE_MAX_PAGE_SIZE);
  });

  it('유효하지 않은 값은 기본 크기로 접는다', () => {
    expect(clampPageSize(0)).toBe(STORAGE_PAGE_STEP);
    expect(clampPageSize(-5)).toBe(STORAGE_PAGE_STEP);
    expect(clampPageSize(Number.NaN)).toBe(STORAGE_PAGE_STEP);
  });

  it('범위 안의 값은 그대로 둔다', () => {
    expect(clampPageSize(50)).toBe(50);
    expect(clampPageSize(150)).toBe(150);
  });
});
