export type ActualDeviceType = 'mobile' | 'tablet' | 'desktop' | 'hmd';
export type MobileOS = 'ios' | 'android' | 'other';
export type HMDType = 'meta-quest' | 'pico' | 'vive' | 'other';

export interface DeviceInfo {
  type: ActualDeviceType;
  os?: MobileOS;
  hmd?: HMDType;
}

/**
 * User-Agent를 기반으로 실제 하드웨어 디바이스 타입과 OS를 감지
 */
export function getDeviceInfo(userAgent: string): DeviceInfo {
  const ua = userAgent.toLowerCase();

  // HMD (VR/MR 헤드셋) 체크: Quest는 Android 기반이므로 Android/Mobile 판별보다 먼저 처리
  // Meta Quest 2/3/Pro, Oculus Browser
  if (/oculusbrowser|\boculus\b|\bquest\b/i.test(ua)) {
    return { type: 'hmd', os: 'android', hmd: 'meta-quest' };
  }
  // Pico (Pico 4, Neo 등)
  if (/picoxr|pico\s?(neo|4|g3|xr)|pico.*browser/i.test(ua)) {
    return { type: 'hmd', os: 'android', hmd: 'pico' };
  }
  // HTC Vive Focus / Wolvic (구 Firefox Reality)
  if (/vive.*focus|wolvic/i.test(ua)) {
    return { type: 'hmd', hmd: 'vive' };
  }

  // iOS 디바이스 체크
  if (/iphone|ipod/i.test(ua)) {
    return { type: 'mobile', os: 'ios' };
  }

  if (/ipad/i.test(ua)) {
    return { type: 'tablet', os: 'ios' };
  }

  // Android 디바이스 체크
  if (/android/i.test(ua)) {
    // Android 태블릿 체크 (mobile 키워드가 없으면 태블릿으로 간주)
    if (!/mobile/i.test(ua)) {
      return { type: 'tablet', os: 'android' };
    }
    return { type: 'mobile', os: 'android' };
  }

  // 기타 태블릿 체크
  if (/tablet|kindle|silk/i.test(ua)) {
    return { type: 'tablet', os: 'other' };
  }

  // 기타 모바일 체크
  if (/mobile|blackberry|windows phone/i.test(ua)) {
    return { type: 'mobile', os: 'other' };
  }

  // 데스크톱
  return { type: 'desktop' };
}
