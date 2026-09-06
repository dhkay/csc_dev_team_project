import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { SecretCipherPort } from '../../../core/application/ports/outbound';

/**
 * AES-256-GCM 시크릿 암복호화 어댑터
 * 저장 포맷: `base64(iv).base64(authTag).base64(cipher)` (iv 12바이트)
 * 키는 GROUPWARE_SECRET_ENC_KEY(32바이트: hex 64자 / base64 44자 / raw 32자). 미설정이면 사용 시점 503.
 *
 * 주의: 키가 바뀌면 기존 암호문은 복호화 불가: 배포 간 키를 안정적으로 고정할 것
 */
@Injectable()
export class AesGcmSecretCipherAdapter implements SecretCipherPort {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    this.key = parseKey(config.get<string>('GROUPWARE_SECRET_ENC_KEY'));
  }

  encrypt(plain: string): string {
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, enc].map((b) => b.toString('base64')).join('.');
  }

  decrypt(payload: string): string {
    const key = this.requireKey();
    const [ivB64, tagB64, encB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !encB64) {
      throw new Error('손상된 암호문 형식입니다.');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'GROUPWARE_SECRET_ENC_KEY 가 설정되지 않았습니다.',
      );
    }
    return this.key;
  }
}

/** 문자열 키를 32바이트 Buffer 로 해석(hex 64 / base64 44 / raw 32). 실패 시 null. */
function parseKey(raw?: string): Buffer | null {
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) return b64;
  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === 32) return utf8;
  return null;
}
