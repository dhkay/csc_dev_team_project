// 이름 규칙(순수): 서버와 같은 제약을 화면에서 먼저 확인해, 왕복 없이 알려 준다.
//
// 서버(storage_service.clean_item_name)가 최종 판정을 하며 여기서 통과한 값도 거부될 수 있다.
// 이쪽은 "왜 안 되는지" 를 즉시 보여 주는 용도다.

const FORBIDDEN_CHARS = /[\\/:*?"<>|]/;
const MAX_LENGTH = 255;

type NameCheck = { ok: true; value: string } | { ok: false; reason: string };

export function checkItemName(raw: string): NameCheck {
  const value = raw.trim();
  if (!value) return { ok: false, reason: '이름을 입력해 주세요.' };
  if (value.length > MAX_LENGTH) return { ok: false, reason: '이름이 너무 깁니다.' };
  if (value === '.' || value === '..') return { ok: false, reason: '쓸 수 없는 이름입니다.' };
  if (FORBIDDEN_CHARS.test(value)) {
    return { ok: false, reason: '\\ / : * ? " < > | 는 쓸 수 없습니다.' };
  }
  return { ok: true, value };
}

/** 확장자를 뺀 본문과 확장자로 나눈다(이름 변경 시 본문만 선택하기 위해) */
export function splitExtension(fileName: string): { base: string; extension: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, extension: '' };
  return { base: fileName.slice(0, dot), extension: fileName.slice(dot) };
}

/**
 * 같은 폴더에 같은 이름이 있으면 `보고서 (1).pdf` 로 비켜 간다.
 * 40개를 한꺼번에 떨어뜨리는 중에 이름을 묻는 것이 더 나쁘기 때문에 업로드는 자동으로 비킨다.
 */
export function nextAvailableName(fileName: string, taken: Iterable<string>): string {
  const existing = new Set(Array.from(taken, (n) => n.toLowerCase()));
  if (!existing.has(fileName.toLowerCase())) return fileName;
  const { base, extension } = splitExtension(fileName);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base} (${i})${extension}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return fileName;
}
