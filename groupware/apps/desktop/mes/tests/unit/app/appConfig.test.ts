import { beforeEach, describe, expect, it } from 'vitest';
import { loadAppConfig, resetAppConfigCache } from '../../../src/lib/app/config/appConfig';

/**
 * 설정 우선순위는 되돌릴 수 없는 결정이라 Phase 0 부터 테스트로 고정한다.
 * 이미 현장에 깔린 앱의 서버 주소는 사람이 PC 마다 가지 않으면 못 고친다.
 */
describe('appConfig', () => {
  beforeEach(() => {
    resetAppConfigCache();
  });

  it('Tauri 밖에서는 빌드 상수와 기본값으로 해석되어야 한다', async () => {
    // 브라우저 단독 개발 경로. config.json 단계는 건너뛴다.
    const config = await loadAppConfig();
    expect(config.apiBaseUrl).toBeTruthy();
    expect(config.updateEndpoint).toBeTruthy();
    expect(config.channel).toBeTruthy();
  });

  it('등록 전에는 단말 ID 가 비어 있어야 한다', async () => {
    // deviceId 는 서버가 enrollment 로 발급한다. 클라이언트가 임의로 만들면 안 된다.
    const config = await loadAppConfig();
    expect(config.deviceId).toBeNull();
  });

  it('같은 호출은 캐시를 재사용해야 한다', async () => {
    const first = await loadAppConfig();
    const second = await loadAppConfig();
    expect(second).toBe(first);
  });

  it('캐시를 비우면 다시 해석해야 한다', async () => {
    const first = await loadAppConfig();
    resetAppConfigCache();
    const second = await loadAppConfig();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
