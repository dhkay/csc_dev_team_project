/** 시크릿 대칭 암호화 아웃바운드 포트: 자격증명 at rest 보호(AES-256-GCM) */
export interface SecretCipherPort {
  /** 평문 → 암호문 문자열. 키 미설정 시 예외 */
  encrypt(plain: string): string;
  /** 암호문 → 평문. 키 미설정/변조 시 예외 */
  decrypt(cipher: string): string;
}

export const SECRET_CIPHER_PORT = Symbol('SECRET_CIPHER_PORT');
