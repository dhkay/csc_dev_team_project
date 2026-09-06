/**
 * 이메일 형식 검사(화면 1차 검증). 관리자 추가/수정과 조직 생성이 공유한다.
 * 최종 판정은 백엔드 DTO(@IsEmail)가 하며, 여기서는 헛된 왕복만 막는다.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailValid(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}
