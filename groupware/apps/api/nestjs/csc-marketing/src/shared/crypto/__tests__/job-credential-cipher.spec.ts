import { ConfigService } from '@nestjs/config';
import { createDecipheriv, createHash } from 'node:crypto';
import { JobCredentialCipher } from '../job-credential-cipher';

/** SERVICE_TOKEN_SECRET 만 읽는 최소 ConfigService 스텁 */
function cipherWithSecret(secret: string): JobCredentialCipher {
  const config = { get: (k: string) => (k === 'SERVICE_TOKEN_SECRET' ? secret : undefined) };
  return new JobCredentialCipher(config as unknown as ConfigService);
}

/** video-model decrypt 와 동일 규약으로 Node 에서 직접 복호화(대칭 검증용) */
function decrypt(token: string, secret: string): string {
  const [iv, tag, ct] = token.split('.');
  const key = createHash('sha256').update(secret, 'utf8').digest();
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

describe('JobCredentialCipher', () => {
  it('base64(iv).base64(tag).base64(cipher) 3부 포맷을 만든다(iv 12바이트)', () => {
    const token = cipherWithSecret('svc-secret').encrypt('xai-key-123');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(Buffer.from(parts[0], 'base64')).toHaveLength(12); // iv
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(16); // GCM tag
  });

  it('같은 시크릿으로 왕복 복호화된다(한글 포함)', () => {
    const token = cipherWithSecret('svc-secret').encrypt('xai-키-테스트');
    expect(decrypt(token, 'svc-secret')).toBe('xai-키-테스트');
  });

  it('키(sha256(SERVICE_TOKEN_SECRET))가 다르면 복호화가 실패한다(변조/오배포 검출)', () => {
    const token = cipherWithSecret('svc-secret').encrypt('xai-key-123');
    expect(() => decrypt(token, 'other-secret')).toThrow();
  });

  it('매 호출 IV 가 달라 같은 평문도 다른 암호문을 낸다', () => {
    const cipher = cipherWithSecret('svc-secret');
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });
});
