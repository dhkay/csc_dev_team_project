// 네이티브 팝아웃(window.open) 헬퍼: 두 web 앱(groupware/control-tower) 공용 primitive.
// 프레임워크 비종속(plain TS): SvelteKit `$app/environment` 대신 `typeof window` 로 SSR 가드한다.
// 앱별 라우트/메시지 계약은 각 앱(popouts.ts, popoutChannel.ts)에 둔다.

/**
 * 팝아웃 창 크기 프리셋: 매번 숫자를 박지 않도록 공용 틀을 제공한다.
 * - sm: 좁은 단일 폼/알림(공지 보기, 간단 편집 등)
 * - md: 표준 상세/편집 폼(조직, 관리자, AI도구 등): 기본값
 * - lg: 넓은 콘텐츠(목록/디렉터리 등)
 * 특수 케이스는 디스크립터의 width/height 로 개별 오버라이드한다.
 */
export type PopoutSize = 'sm' | 'md' | 'lg';

export const POPOUT_SIZES: Record<PopoutSize, { width: number; height: number }> = {
  sm: { width: 460, height: 460 },
  md: { width: 520, height: 640 },
  lg: { width: 1000, height: 680 },
};

/** 팝아웃 1개의 명세: url/name/size 를 함께 묶는다(앱별 popouts.ts 가 단일 출처로 생성) */
export interface PopoutDescriptor {
  // 팝아웃이 로드할 같은 origin 경로(반드시 가드 세그먼트 하위의 인증 라우트)
  url: string;
  // window.open target name: 같은 name 재사용 시 새 창 대신 기존 창 포커스(중복 클릭 방지)
  name: string;
  // 크기 프리셋(기본 'md'). 대부분 이걸로 충분: 세밀 조정만 width/height 로
  size?: PopoutSize;
  // 프리셋 미세 조정용 오버라이드(지정 시 해당 축만 프리셋 대신 사용)
  width?: number;
  height?: number;
}

/**
 * 팝아웃 창 열기
 * - 반드시 클릭 등 사용자 제스처 핸들러 안에서 호출(팝업 차단 회피)
 * - url/name 은 앱 popouts.ts 의 디스크립터로 전달해 호출부에 매직 스트링을 두지 않는다.
 * - 크기는 size 프리셋(기본 md) → width/height 오버라이드 순으로 해석
 */
export function openPopout({ url, name, size = 'md', width, height }: PopoutDescriptor): void {
  if (typeof window === 'undefined') return;

  const preset = POPOUT_SIZES[size];
  const resolvedWidth = width ?? preset.width;
  const resolvedHeight = height ?? preset.height;

  // 현재 창 기준 화면 중앙(멀티모니터 고려)
  const baseLeft = window.screenLeft ?? window.screenX ?? 0;
  const baseTop = window.screenTop ?? window.screenY ?? 0;
  const outerW = window.outerWidth || window.innerWidth;
  const outerH = window.outerHeight || window.innerHeight;
  const left = Math.round(baseLeft + (outerW - resolvedWidth) / 2);
  const top = Math.round(baseTop + (outerH - resolvedHeight) / 2);

  const features = `popup=yes,width=${resolvedWidth},height=${resolvedHeight},left=${left},top=${top}`;
  const win = window.open(url, name, features);
  win?.focus();
}
