import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { resolveServiceSecret } from '@csc/net-utils';

/**
 * 잡 params 크레덴셜 암호화: 조직 외부 API 키를 AES-256-GCM 으로 보호
 * params 가 video-model Postgres 와 redis 에 영속되므로 평문 금지
 * 와이어 포맷 `base64(iv).base64(authTag).base64(cipher)`(iv 12바이트), 워커가 대칭 복호화
 */
@Injectable()
export class JobCredentialCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    // 전용 키(JOB_CREDENTIAL_ENC_KEY)가 있으면 그것을, 없으면 SERVICE_TOKEN_SECRET 로 폴백
    // 워커도 동일 우선순위라 활성화하려면 양쪽 env 를 같은 값으로 함께 설정
    const dedicated = config.get<string>('JOB_CREDENTIAL_ENC_KEY');
    const secret =
      dedicated && dedicated.length > 0
        ? dedicated
        : resolveServiceSecret(config.get('SERVICE_TOKEN_SECRET'), {
            isProduction: process.env.NODE_ENV === 'production',
          });
    this.key = createHash('sha256').update(secret, 'utf8').digest();
  }

  /** 평문을 `base64(iv).base64(tag).base64(cipher)` 로 변환. 워커가 사용 직전 복호화 */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, enc].map((b) => b.toString('base64')).join('.');
  }
}
