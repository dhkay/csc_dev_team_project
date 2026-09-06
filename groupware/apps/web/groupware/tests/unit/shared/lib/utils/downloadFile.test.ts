// 다운로드 파일명 생성: 목록의 제목을 그대로 파일명으로 쓰기 때문에 방어가 필요하다.
// 기획안 제목엔 `/`, `?`, `:` 같은 문자가 흔히 들어가는데(예: "여름철 발진, 진정 루틴 3가지?"),
// 그대로 두면 윈도우에서 저장이 실패하거나 경로로 해석된다.
import { describe, it, expect } from 'vitest';
import { toSafeFileName } from '../../../../../src/lib/shared/lib/utils/downloadFile';

describe('toSafeFileName', () => {
  it('제목과 확장자를 그대로 잇는다', () => {
    expect(toSafeFileName('여름철 진정 루틴', 'mp4')).toBe('여름철 진정 루틴.mp4');
  });

  it('경로/금지 문자를 공백으로 바꾼다. 경로 탈출과 저장 실패를 함께 막는다', () => {
    expect(toSafeFileName('a/b\\c:d*e?f"g<h>i|j', 'mp4')).toBe('a b c d e f g h i j.mp4');
    expect(toSafeFileName('../../etc/passwd', 'mp4')).toBe('.. .. etc passwd.mp4');
  });

  it('연속 공백을 접고 앞뒤를 다듬는다', () => {
    expect(toSafeFileName('  제목   //  둘  ', 'mp4')).toBe('제목 둘.mp4');
  });

  it('빈 제목(또는 금지 문자뿐)은 fallback 으로 대체한다. ".mp4" 같은 숨김파일이 되지 않게', () => {
    expect(toSafeFileName('', 'mp4')).toBe('download.mp4');
    expect(toSafeFileName('///', 'mp4')).toBe('download.mp4');
    expect(toSafeFileName('   ', 'mp4')).toBe('download.mp4');
  });

  it('아주 긴 제목은 잘라 파일시스템 한도를 넘지 않게 한다', () => {
    const name = toSafeFileName('가'.repeat(300), 'mp4');
    expect(name.endsWith('.mp4')).toBe(true);
    expect(name.length).toBe(124); // 120자 + '.mp4'
  });
});
