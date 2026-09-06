import { describe, expect, it } from 'vitest';
import {
  publicFilePath,
  publicFileUrl
} from '$lib/features/storage/lib/publicUrl';
import { downloadHref } from '$lib/features/storage/apis/storageApi';

/**
 * 공통 파일의 주소는 로그인 없이 열린다. 그래서 어느 영역이냐에 따라 주소가 갈린다:
 * 공통은 공개 경로, 조직과 개인은 세션을 확인하는 BFF 경로다. 이 갈림이 무너지면 조직 파일
 * 주소가 공개 경로로 나가거나(노출), 공통 파일 주소가 밖에서 안 열린다(기능 상실)
 */
describe('파일 주소', () => {
  it('공통은 공개 경로를 쓴다', () => {
    expect(downloadHref({ area: 'COMMON', departmentId: null }, 'abc')).toBe(
      publicFilePath('abc')
    );
  });

  it('조직과 개인은 세션을 확인하는 경로를 쓴다', () => {
    const dept = downloadHref({ area: 'DEPARTMENT', departmentId: 3 }, 'abc');
    const personal = downloadHref({ area: 'PERSONAL', departmentId: null }, 'abc');

    for (const href of [dept, personal]) {
      expect(href.startsWith('/api/storage/files/')).toBe(true);
      expect(href.startsWith(publicFilePath(''))).toBe(false);
    }
    expect(dept).toContain('dept=3');
  });

  it('id 를 그대로 붙이지 않고 인코딩한다', () => {
    expect(publicFilePath('a/b')).toBe('/f/a%2Fb');
  });

  it('복사용 주소는 절대 주소다', () => {
    expect(publicFileUrl('https://example.com', 'abc')).toBe('https://example.com/f/abc');
  });
});
