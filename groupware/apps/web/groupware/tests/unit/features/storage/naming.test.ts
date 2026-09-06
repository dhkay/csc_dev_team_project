import { describe, expect, it } from 'vitest';
import {
  checkItemName,
  nextAvailableName,
  splitExtension
} from '$lib/features/storage/lib/naming';
import { formatBytes, formatDate } from '$lib/features/storage/lib/bytes';
import { fileKindOf } from '$lib/features/storage/lib/mime';
import { parseSortId } from '$lib/features/storage/lib/sort';

describe('checkItemName', () => {
  it('앞뒤 공백을 다듬는다', () => {
    expect(checkItemName('  보고서.pdf ')).toEqual({ ok: true, value: '보고서.pdf' });
  });

  it.each(['', '   ', '.', '..', '폴더/파일.pdf', 'a:b.txt', 'a'.repeat(256)])(
    '쓸 수 없는 이름을 거부한다: %s',
    (bad) => {
      expect(checkItemName(bad).ok).toBe(false);
    }
  );
});

describe('splitExtension', () => {
  it('확장자를 분리한다', () => {
    expect(splitExtension('보고서.pdf')).toEqual({ base: '보고서', extension: '.pdf' });
  });

  it('점이 없으면 전체가 본문이다', () => {
    expect(splitExtension('README')).toEqual({ base: 'README', extension: '' });
  });

  it('숨김 파일의 앞점은 확장자가 아니다', () => {
    expect(splitExtension('.env')).toEqual({ base: '.env', extension: '' });
  });
});

describe('nextAvailableName', () => {
  it('같은 이름이 없으면 그대로 쓴다', () => {
    expect(nextAvailableName('보고서.pdf', ['회의록.docx'])).toBe('보고서.pdf');
  });

  it('충돌하면 번호를 붙인다', () => {
    expect(nextAvailableName('보고서.pdf', ['보고서.pdf'])).toBe('보고서 (1).pdf');
    expect(nextAvailableName('보고서.pdf', ['보고서.pdf', '보고서 (1).pdf'])).toBe(
      '보고서 (2).pdf'
    );
  });

  it('대소문자가 달라도 같은 이름으로 본다', () => {
    expect(nextAvailableName('Report.PDF', ['report.pdf'])).toBe('Report (1).PDF');
  });
});

describe('formatBytes', () => {
  it('단위를 올려 가며 표기한다', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('값이 없거나 음수면 0 으로 본다', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
  });
});

describe('formatDate', () => {
  it('값이 없으면 하이픈', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('그럴듯하지 않은 값')).toBe('-');
  });
});

describe('fileKindOf', () => {
  it('mime 을 먼저 본다', () => {
    expect(fileKindOf('image/png', 'a.bin')).toBe('image');
    expect(fileKindOf('application/pdf', 'a.bin')).toBe('pdf');
  });

  it('mime 이 없으면 확장자로 보완한다', () => {
    expect(fileKindOf('', '자료.xlsx')).toBe('sheet');
    expect(fileKindOf('application/octet-stream', '묶음.zip')).toBe('archive');
  });
});

describe('parseSortId', () => {
  it('정렬 축과 방향으로 가른다', () => {
    expect(parseSortId('size-desc')).toEqual({ sort: 'size', descending: true });
    expect(parseSortId('name-asc')).toEqual({ sort: 'name', descending: false });
  });

  it('모르는 값은 기본값으로 접는다', () => {
    expect(parseSortId('아무거나')).toEqual({ sort: 'name', descending: false });
    expect(parseSortId(null)).toEqual({ sort: 'name', descending: false });
  });
});
