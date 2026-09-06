/**
 * 썸네일 합성 규칙
 *
 * 미리보기와 내려받는 파일을 같은 함수가 그린다. 미리보기를 DOM 으로 얹고 저장만 캔버스로 그리면
 * 줄바꿈, 자간, 그림자가 미묘하게 달라져 "보이는 것과 받은 것이 다른" 상태가 된다. 그 어긋남은 파일을
 * 열어 봐야 드러난다. 그래서 화면의 미리보기도 캔버스이고, 저장은 같은 그리기를 큰 해상도로 한 번 더
 * 하는 것뿐이다.
 *
 * 위치와 크기를 정규화 좌표(0~1) 로 들고 있는 이유도 같다. 미리보기는 화면에 맞춘 작은 캔버스이고
 * 저장본은 원본 해상도라, 픽셀로 들면 둘이 어긋난다.
 */

/**
 * 글자 굵기 범위(CSS font-weight)
 *
 * 굵기를 셋으로 좁히지 않고 열어 두는 이유는 크기를 직접 적게 한 것과 같다. 어느 굵기가 맞는지는
 * 장면과 문구를 보는 사람이 안다.
 * 100~900 은 CSS 가 정한 값 공간 전체이고 이 글꼴은 그 구간을 가변 폰트로 받아 와 사이 값도 그려진다.
 */
export const MIN_FONT_WEIGHT = 100;
export const MAX_FONT_WEIGHT = 900;
/** 굵기 눈금. CSS 가 쓰는 100 단위를 그대로 따른다(가변 폰트라 그 사이도 그려지지만 눈금은 100이면 충분하다) */
export const FONT_WEIGHT_STEP = 100;

/**
 * 색 프리셋. 썸네일 글자는 어두운 화면 위에 얹히는 일이 많아 밝은 쪽으로 고른다.
 * 그 밖의 색은 색 선택기로 직접 고른다(프리셋은 빠른 길이지 제한이 아니다)
 */
export const TEXT_COLORS: readonly string[] = ['#facc15', '#ffffff', '#ef4444', '#22d3ee'];

/**
 * 썸네일 글꼴
 *
 * 첫 자리가 Noto Sans KR 이고, 그것을 실제로 받아 온다(`thumbnailFont.ts`). 뒤의 시스템 글꼴은
 * 받아 오지 못했을 때의 폴백이다: 글자가 안 그려지는 것보다 다른 글꼴로라도 그려지는 편이 낫다.
 *
 * 웹폰트는 저장 시점에 아직 로드되지 않아 미리보기와 다른 글꼴로 그려질 수 있다. 그것은 웹폰트를
 * 쓰지 말아야 할 이유가 아니라 그리기 전에 로드를 기다려야 할 이유라, 미리보기와 저장 둘 다 기다린다.
 */
export const THUMBNAIL_FONT_FAMILY = 'Noto Sans KR';
/** 그리기용 스택. 내보내지 않는다: 이 파일 밖에서 글꼴을 직접 지정할 일이 없다(그리는 곳이 여기다) */
const THUMBNAIL_FONT_STACK =
  `"${THUMBNAIL_FONT_FAMILY}", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif`;

/**
 * 글자 크기 범위(프레임 높이 대비 비율)
 *
 * 넓게 잡는다. 아래쪽은 구석에 작게 넣는 표기까지, 위쪽은 화면을 채우는 한 단어까지 쓰이고, 어느 쪽이
 * 맞는지는 만드는 사람이 안다. 범위가 있는 이유는 취향을 좁히려는 것이 아니라 뜻이 없는 값
 * (0 이나 프레임보다 큰 글자)을 막기 위한 것이다.
 *
 * 비율로 드는 이유는 미리보기와 저장본의 크기가 달라서다(정규화 좌표와 같은 이유). 화면에는 저장본
 * 기준 px 로 환산해 보여준다: 사람은 글자 크기를 px 로 생각한다.
 */
export const MIN_FONT_SCALE = 0.02;
export const MAX_FONT_SCALE = 0.4;

export interface ThumbnailOverlay {
  // 문구. 줄바꿈으로 여러 줄. 비어 있으면 글자를 그리지 않는다(바탕만 남는다)
  text: string;
  // 글자 크기: 프레임 높이 대비 비율
  fontScale: number;
  // 글자 굵기(CSS font-weight, 100~900)
  weight: number;
  color: string;
  // 바탕을 덮는 검은 막의 진하기(0~1). 글자를 읽히게 하는 장치다.
  dimOpacity: number;
  // 글자 블록의 중심. 정규화 좌표(0~1)
  x: number;
  y: number;
}

export const DEFAULT_OVERLAY: ThumbnailOverlay = {
  text: '',
  fontScale: 0.1,
  weight: 700,
  color: TEXT_COLORS[0],
  dimOpacity: 0.45,
  x: 0.5,
  y: 0.72,
};

/** 줄 간격(글자 크기 배수) */
const LINE_HEIGHT = 1.25;
/**
 * 글자 테두리 두께(글자 크기 대비)
 *
 * 테두리 색이 글자 색과 같으므로(아래 그리기) 이 값은 대비가 아니라 두께다. 그래서 굵기와 하는
 * 일이 겹치고, 겹치는 만큼 굵기 조절의 폭을 잡아먹는다.
 *
 * 예전 값(0.08)은 그 폭을 거의 다 먹었다. 획은 경로 위에 걸쳐 그려져 바깥으로 절반이 번지므로,
 * 100px 글자에 8px 획이면 모든 획이 사방으로 4px 씩 두꺼워진다. 그건 100 과 900 의 차이보다 큰
 * 값이라 어느 굵기를 골라도 비슷하게 두꺼워 보였다. 굵기를 열어 두는 의미가 없어진다.
 *
 * 지금 값은 글자 경계를 또렷하게 하는 정도만 남긴다. 두께는 굵기가 정한다.
 */
const STROKE_RATIO = 0.02;

/** 0~1 로 자른다. 슬라이더가 범위를 지키더라도 저장된 값이 그 밖일 수 있다(다른 화면이 만든 값) */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 글자 크기 비율을 유효 범위로 자른다. 숫자가 아니면 기본값으로 되돌린다.
 *
 * 사람이 직접 입력하는 값이라 빈 칸과 지우는 도중의 상태가 그대로 들어온다. 그때 NaN 이 흘러가면
 * `ctx.font` 가 통째로 무시되어 글자만 조용히 사라진다(예외도 나지 않는다)
 */
export function clampFontScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_OVERLAY.fontScale;
  return Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, scale));
}

/**
 * 글자 굵기를 유효 범위로 자른다. 크기와 같은 이유로 필요하다(사람이 직접 적는 값)
 *
 * 정수로 맞추는 이유: `ctx.font` 는 CSS 문법이라 소수 weight 를 받지 않는다. 그런 값이 들어가면
 * font 대입이 통째로 무시되어 글자만 조용히 사라진다(예외도 나지 않는다)
 */
export function clampFontWeight(weight: number): number {
  if (!Number.isFinite(weight)) return DEFAULT_OVERLAY.weight;
  return Math.round(Math.max(MIN_FONT_WEIGHT, Math.min(MAX_FONT_WEIGHT, weight)));
}

/** 빈 줄은 버린다. 문구 끝의 개행 하나가 글자 블록을 위로 밀어 올리지 않게 */
export function overlayLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 썸네일 한 장을 그린다. 바탕(프레임) → 어둡게 덮기 → 글자 순
 *
 * `base` 가 없으면 바탕을 단색으로 칠한다. 영상 프레임을 가져오지 못한 경우이고(주소가 없거나 로드
 * 실패), 그때도 글자 편집과 저장은 그대로 동작한다.
 */
export function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  base: CanvasImageSource | null,
  overlay: ThumbnailOverlay,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);

  if (base) {
    ctx.drawImage(base, 0, 0, width, height);
  } else {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);
  }

  const dim = clamp01(overlay.dimOpacity);
  if (dim > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${dim})`;
    ctx.fillRect(0, 0, width, height);
  }

  const lines = overlayLines(overlay.text);
  if (lines.length === 0) return;

  const fontSize = height * clampFontScale(overlay.fontScale);
  const weight = clampFontWeight(overlay.weight);
  // 이 글꼴이 로드돼 있어야 미리보기와 저장본이 같은 모양이 된다(그리는 쪽이 ensureThumbnailFont 를
  //   먼저 기다린다). 로드되지 않았으면 스택 뒤의 시스템 글꼴로 그려진다.
  ctx.font = `${weight} ${fontSize}px ${THUMBNAIL_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const step = fontSize * LINE_HEIGHT;
  const centerX = clamp01(overlay.x) * width;
  const centerY = clamp01(overlay.y) * height;
  const firstY = centerY - ((lines.length - 1) * step) / 2;

  // 테두리와 글자는 같은 색이다. 색을 하나만 고르므로 고른 색이 그대로 글자의 색이 되고,
  //   덧그은 획은 윤곽선이 아니라 두께로만 보인다.
  //
  // 테두리를 검정으로 고정하지 않는다. 어떤 색을 골라도 검은 윤곽이 따라붙어 고른 색이 그 색으로
  // 보이지 않는다. 배경과의 대비는 덮기(dimOpacity)가 맡는다(그쪽은 장면을 보고 조절할 수 있다)
  ctx.strokeStyle = overlay.color;
  ctx.fillStyle = overlay.color;
  ctx.lineWidth = fontSize * STROKE_RATIO;
  for (const [i, line] of lines.entries()) {
    const y = firstY + i * step;
    ctx.strokeText(line, centerX, y);
    ctx.fillText(line, centerX, y);
  }
}
