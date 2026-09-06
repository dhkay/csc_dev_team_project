/**
 * 스토리지 목록의 화면 폭 계약 테스트
 *
 * 넓은 화면은 다섯 열(이름/유형/크기/올린 사람/수정한 날짜)을 펼치고, 좁은 화면은 이름만 남기고
 * 나머지를 이름 아래 한 줄로 접는다. 접는 걸 빠뜨리면 폰 폭에서 이름이 몇 글자만 남는데,
 * 그 사고는 데스크탑에서 보이지 않아 조용히 지나간다. 그래서 렌더 계약으로 고정한다.
 *
 * 접는 일은 조건부 렌더가 아니라 CSS(`hidden lg:table-cell`)가 한다. jsdom 은 Tailwind 를 적용하지
 * 않으므로 "보이는가" 대신 그 클래스가 붙어 있는가를 본다. 클래스가 곧 접는 기계장치라
 * 그것이 빠지면 좁은 화면에서 열이 그대로 남는다.
 *
 * 정보가 사라지지 않는다는 점도 함께 지킨다. 열을 접어도 크기와 올린 사람과 날짜를 한 줄로 읽는다.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import StorageItemList from '$lib/pages/admin/storage/components/StorageItemList.svelte';
import type { StorageActor, StorageFile } from '$lib/features/storage/types';

const ME = 11;

const actor: StorageActor = {
  userId: ME,
  canManage: false,
  isTeamLeader: false,
  accessibleDepartmentIds: []
};

const file: StorageFile = {
  id: 'f1',
  fileName: '1분기 보고서.pdf',
  mimeType: 'application/pdf',
  size: 2048,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
  ownerUserId: ME,
  deletedAt: null,
  deletedByUserId: null
};

const props = {
  files: [file],
  actor,
  scope: { area: 'COMMON', departmentId: null } as const,
  trashed: false,
  pending: false,
  ownerOf: () => ({ name: '홍길동', email: 'hong@example.com' }),
  downloadHref: () => '/api/storage/files/f1/download?area=COMMON',
  onRename: () => {},
  onTrash: () => {},
  onRestore: () => {},
  onPurge: () => {}
};

/** 부가 열이 좁은 화면에서 접히는 방식. 값이 바뀌면 컴포넌트의 WIDE_CELL 과 함께 바뀐다. */
const FOLDED = ['hidden', 'lg:table-cell'];

describe('StorageItemList', () => {
  it('다섯 열을 모두 그리고 부가 열만 접는 표시를 단다', () => {
    render(StorageItemList, { props });

    expect(screen.getByRole('columnheader', { name: '이름' })).not.toHaveClass('hidden');
    for (const header of ['유형', '크기', '올린 사람', '수정한 날짜']) {
      expect(screen.getByRole('columnheader', { name: header })).toHaveClass(...FOLDED);
    }
    // 넓은 자리라 사람은 이름과 이메일을 함께 적는다(동명이인 구분)
    expect(screen.getByRole('cell', { name: '홍길동 (hong@example.com)' })).toHaveClass(...FOLDED);
  });

  it('접힌 정보를 이름 아래 한 줄로 되돌려 준다', () => {
    render(StorageItemList, { props });

    const row = screen.getByRole('row', { name: /1분기 보고서/ });
    // 값을 여럿 이어 붙인 줄이라 유형 열("PDF")이나 크기 열("2 KB") 하나만으로는 이 줄을 못 집는다.
    const folded = within(row).getByText(/PDF.*2 KB/);
    // 이 줄은 열이 펼쳐지는 넓은 화면에서는 사라진다(같은 값을 두 번 읽히지 않는다)
    expect(folded).toHaveClass('lg:hidden');
    const text = folded.textContent ?? '';
    expect(text).toContain('PDF');
    expect(text).toContain('2 KB');
    expect(text).toContain('홍길동');
  });

  it('파일 이름은 다운로드 링크다', () => {
    render(StorageItemList, { props });

    expect(screen.getByRole('link', { name: '1분기 보고서.pdf' })).toHaveAttribute(
      'href',
      '/api/storage/files/f1/download?area=COMMON'
    );
  });
});
