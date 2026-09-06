// 비밀번호 정책(프론트 SSOT): 8자 이상, 영문 대문자, 영문 소문자, 숫자, 특수문자
// user 서버 DTO 의 @Matches 규칙 및 groupware passwordPolicy.ts 와 동일하게 유지한다.
// (앱이 분리돼 공유 모듈을 두지 않으므로 수동 동기화). 규칙을 바꿀 때는 모두 함께 수정한다.

export interface PasswordRule {
  key: string;
  label: string;
  test: (password: string) => boolean;
}

/**
 * 특수문자로 인정하는 문자: ASCII 기호만
 *
 * `[^A-Za-z0-9]` 로 두면 한글, 공백, 이모지까지 특수문자로 세어서, 한글이 섞인 비밀번호는
 * 기호 없이도 통과했다(예: abcd1234가). 인정 범위를 기호로 한정한다.
 * (하이픈은 범위 기호로 읽히지 않도록 클래스 맨 뒤에 둔다.)
 */
const SPECIAL_CHARACTER = /[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]/;

/** 충족해야 할 규칙 목록(UI 체크리스트 + 검증 공용). */
export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', label: '8자 이상', test: (p) => p.length >= 8 },
  { key: 'upper', label: '영문 대문자 포함', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: '영문 소문자 포함', test: (p) => /[a-z]/.test(p) },
  { key: 'number', label: '숫자 포함', test: (p) => /[0-9]/.test(p) },
  { key: 'special', label: '특수문자 포함', test: (p) => SPECIAL_CHARACTER.test(p) },
];

/** 모든 규칙을 충족하는가. */
export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
