/**
 * 썸네일 글꼴을 실제로 받아 온다. 그리기 전에 이것을 기다려야 한다.
 *
 * 캔버스는 글꼴 로드를 기다려 주지 않는다. 아직 없는 글꼴로 `fillText` 를 부르면 그 자리에 있는 다른
 * 글꼴로 즉시 그려 버리고, 나중에 글꼴이 도착해도 이미 그려진 픽셀은 바뀌지 않는다. 미리보기와
 * 저장본이 각각 다른 순간에 그려지므로 둘이 다른 글꼴이 되는 일이 실제로 생긴다.
 *
 * 그래서 로드를 한 번만 시작해 두고, 그리는 쪽은 그 약속을 기다린 뒤에 그린다.
 *
 * 실패해도 거절하지 않는다. 글꼴을 못 받는 것은 썸네일을 못 만들 이유가 아니다(폴백 글꼴로
 * 그려진다). 여기서 던지면 그리기 자체가 막혀 화면이 비게 된다.
 */
import {
  MAX_FONT_WEIGHT,
  MIN_FONT_WEIGHT,
  THUMBNAIL_FONT_FAMILY,
} from './thumbnailOverlay';

/**
 * Google Fonts 스타일시트. 이 앱이 웹폰트를 쓰는 유일한 자리라 전역에 얹지 않고 여기서 붙인다.
 *
 * 구간(`100..900`)으로 요청한다. 굵기를 사람이 자유롭게 정하므로 몇 개를 골라 나열할 수 없다.
 * 구간 문법은 가변 폰트 파일 하나를 주므로, 사이의 어떤 굵기도 실제로 그 굵기로 그려진다.
 * (개별 굵기를 나열하면 그 셋만 오고 나머지는 브라우저가 흉내 내거나 가장 가까운 것으로 떨어진다)
 */
const STYLESHEET_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@' +
  `${MIN_FONT_WEIGHT}..${MAX_FONT_WEIGHT}` +
  '&display=swap';

/** 이 문서에 이미 붙였는지 표시(중복 삽입 방지) */
const LINK_ID = 'thumbnail-font';

/** 한 번만 시작하고 그 약속을 나눠 준다. 여러 곳이 불러도 요청은 한 번이다. */
let loading: Promise<void> | null = null;

/**
 * 글꼴이 그릴 준비가 될 때까지 기다린다(멱등, 실패해도 정상 종료)
 *
 * 가변 폰트는 파일 하나가 구간 전체를 담으므로 굵기 하나만 기다리면 된다. 그 파일이 오면 100 도
 * 900 도 그 파일이 그린다(굵기별 파일이었다면 굵기마다 따로 기다려야 했다)
 */
export function ensureThumbnailFont(): Promise<void> {
  if (loading) return loading;
  loading = load().catch(() => undefined);
  return loading;
}

async function load(): Promise<void> {
  if (typeof document === 'undefined') return;

  if (!document.getElementById(LINK_ID)) {
    const link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    link.href = STYLESHEET_URL;
    document.head.appendChild(link);
  }

  // 구형 브라우저에는 이 API 가 없다. 그때는 스타일시트만 얹고 폴백 글꼴로 그려지게 둔다.
  if (!document.fonts) return;

  // 크기는 무엇이든 상관없다(로드 단위는 크기가 아니라 얼굴이다). 문자열 형식만 맞으면 된다.
  await document.fonts.load(`${MIN_FONT_WEIGHT} 16px "${THUMBNAIL_FONT_FAMILY}"`);
}
