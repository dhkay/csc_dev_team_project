// 인포그래픽 씬 이미지 렌더러: 수집 데이터(다형 인포그래픽)를 클린 PNG 로 직접 그린다.
//  - FLUX/gpt-image 는 도표/한글 텍스트를 제대로 못 그리므로, 인포그래픽 씬은 사진 대신 데이터로 렌더한다.
//  - 형태(type)별 렌더러 레지스트리(BODY_RENDERERS): 새 형태 추가 = 렌더러 하나 + 레지스트리 한 줄
//  - 캔버스 2D → PNG data URL. 결정적, 무비용/무네트워크, 브라우저 전용. 결과 URL 은 다른 씬 이미지와
//    동일하게 저장 파이프라인(presign→PUT→confirm)으로 업로드된다.
//  - 애니메이션 seam: 구조화 데이터(PlanInfographic)가 SSOT. 정적 PNG 는 한 소비자이고, 후속 애니메이션
//    렌더러는 같은 데이터를 소비하는 병렬 레지스트리로 붙일 수 있다.
import type { InfographicType, PlanInfographic } from '$lib/features/marketing-channels/types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { versionAspectHeightFactor } from './marketingAspect';

// 프레임 크기: 폭만 정하고 높이는 그 버전의 화면비에서 파생한다. 이 그림은 씬 사진과 같은
//   자리에 들어가 영상의 한 프레임이 되므로, 비율이 다르면 렌더러가 좌우를 잘라낸다(`_cover`)
const WIDTH = 1024;
const frameHeight = (version: VersionMode): number =>
  Math.round(WIDTH * versionAspectHeightFactor(version));
const PAD = 88;
const ACCENT = '#3b5bdb';
const BG = '#f5f7fb';
const TITLE_COLOR = '#151a24';
const ITEM_COLOR = '#2b3340';
const MUTED = '#8a94a6';
const LINE = '#dfe3ea';
const ALT = '#eef1f6';
const ON_ACCENT = '#ffffff';
// 한글 안전 폰트 스택(시스템 폰트: 캔버스는 사용 가능한 폰트로 폴백)
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";

/** 콘텐츠 영역(제목 아래): 형태별 렌더러가 이 박스 안에 그린다. */
interface Layout {
  x: number;
  y: number;
  width: number;
  bottom: number;
}

/** 주어진 폭에 맞게 텍스트를 줄바꿈: 글자 단위 누적(공백이 드문 한글 대응) */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    const next = line + ch;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = ch === ' ' ? '' : ch;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// 형태별 바디 렌더러 (콘텐츠 박스 안에 그린다)

/** 목록/단계 공용: 번호 배지 + 워드랩. connector=true 면 배지 사이 커넥터 선(단계) */
function renderBadgedItems(
  ctx: CanvasRenderingContext2D,
  items: string[],
  { x, y, width }: Layout,
  connector: boolean,
): void {
  const badge = 56;
  const gap = 28;
  const textX = x + badge + gap;
  const textW = width - badge - gap;
  let cy = y;
  items.forEach((item, i) => {
    ctx.font = `500 40px ${FONT}`;
    const lines = wrapLines(ctx, item, textW);
    const rowH = Math.max(lines.length * 54, badge);
    // 번호 배지
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(x + badge / 2, cy + badge / 2, badge / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ON_ACCENT;
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x + badge / 2, cy + badge / 2 + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    // 항목 텍스트
    ctx.fillStyle = ITEM_COLOR;
    ctx.font = `500 40px ${FONT}`;
    let ty = cy;
    for (const l of lines) {
      ctx.fillText(l, textX, ty);
      ty += 54;
    }
    const next = cy + rowH + 34;
    if (connector && i < items.length - 1) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + badge / 2, cy + badge + 4);
      ctx.lineTo(x + badge / 2, next - 4);
      ctx.stroke();
    }
    cy = next;
  });
}

/** 표: 헤더행(액센트) + 데이터행(alt 배경) + 셀 워드랩 + 격자선 */
function renderTable(
  ctx: CanvasRenderingContext2D,
  info: Extract<PlanInfographic, { type: 'table' }>,
  { x, y, width }: Layout,
): void {
  const cols = Math.max(info.columns.length, 1);
  const colW = width / cols;
  const cellPad = 16;
  // 셀 워드랩은 글자마다 measureText 를 부르는 비싼 계산이라 행마다 한 번만 하고, 높이와 그리기가 같은 결과를 쓴다.
  const layoutRow = (cells: string[], font: string): { lines: string[][]; height: number } => {
    ctx.font = font;
    const lines = cells.map((c) => wrapLines(ctx, c, colW - cellPad * 2));
    const maxLines = Math.max(1, ...lines.map((l) => l.length));
    return { lines, height: maxLines * 42 + cellPad * 2 };
  };
  const drawRow = (cells: string[], cy: number, font: string, color: string, bg?: string): number => {
    const { lines, height: h } = layoutRow(cells, font);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(x, cy, width, h);
    }
    ctx.font = font;
    ctx.fillStyle = color;
    lines.forEach((cellLines, ci) => {
      let ty = cy + cellPad;
      for (const l of cellLines) {
        ctx.fillText(l, x + ci * colW + cellPad, ty);
        ty += 42;
      }
    });
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, cy, width, h);
    for (let ci = 1; ci < cols; ci += 1) {
      ctx.beginPath();
      ctx.moveTo(x + ci * colW, cy);
      ctx.lineTo(x + ci * colW, cy + h);
      ctx.stroke();
    }
    return cy + h;
  };
  let cy = drawRow(info.columns, y, `700 32px ${FONT}`, ON_ACCENT, ACCENT);
  info.rows.forEach((r, ri) => {
    const cells = info.columns.map((_, ci) => r[ci] ?? '');
    cy = drawRow(cells, cy, `500 32px ${FONT}`, ITEM_COLOR, ri % 2 ? ALT : undefined);
  });
}

/** 막대그래프: 수평 막대(라벨 + value/max 비례 바 + 값) */
function renderBar(
  ctx: CanvasRenderingContext2D,
  info: Extract<PlanInfographic, { type: 'bar' }>,
  { x, y, width }: Layout,
): void {
  const max = Math.max(...info.bars.map((b) => b.value), 1);
  const rowH = 100;
  const labelW = Math.min(280, width * 0.32);
  const gap = 20;
  const barX = x + labelW + gap;
  const barMaxW = width - labelW - gap - 130; // 값 텍스트 공간 확보
  let cy = y;
  ctx.textBaseline = 'middle';
  info.bars.forEach((b) => {
    ctx.font = `600 34px ${FONT}`;
    ctx.fillStyle = ITEM_COLOR;
    ctx.textAlign = 'left';
    ctx.fillText(b.label, x, cy + rowH / 2, labelW);
    const w = Math.max(6, (b.value / max) * barMaxW);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(barX, cy + rowH / 2 - 22, w, 44);
    ctx.font = `700 32px ${FONT}`;
    ctx.fillStyle = TITLE_COLOR;
    ctx.fillText(`${b.value}${info.unit ?? ''}`, barX + w + 16, cy + rowH / 2);
    cy += rowH;
  });
  ctx.textBaseline = 'top';
}

/** 비교: 좌우 2열(heading + 요점) + 중앙 구분선 */
function renderComparison(
  ctx: CanvasRenderingContext2D,
  info: Extract<PlanInfographic, { type: 'comparison' }>,
  { x, y, width, bottom }: Layout,
): void {
  const midX = x + width / 2;
  const colGap = 32;
  const colW = width / 2 - colGap;
  const drawSide = (side: { heading: string; points: string[] }, sx: number): void => {
    let cy = y;
    ctx.font = `700 38px ${FONT}`;
    ctx.fillStyle = ACCENT;
    for (const l of wrapLines(ctx, side.heading, colW)) {
      ctx.fillText(l, sx, cy);
      cy += 48;
    }
    cy += 16;
    side.points.forEach((p) => {
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(sx + 8, cy + 18, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ITEM_COLOR;
      ctx.font = `500 34px ${FONT}`;
      let ty = cy;
      for (const l of wrapLines(ctx, p, colW - 32)) {
        ctx.fillText(l, sx + 32, ty);
        ty += 46;
      }
      cy = ty + 18;
    });
  };
  drawSide(info.left, x);
  drawSide(info.right, midX + colGap);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(midX, y);
  ctx.lineTo(midX, bottom);
  ctx.stroke();
}

/** 핵심지표: 큰 값 + 작은 라벨(1개=1열, 2개+=2열 그리드) */
function renderStat(
  ctx: CanvasRenderingContext2D,
  info: Extract<PlanInfographic, { type: 'stat' }>,
  { x, y, width }: Layout,
): void {
  const cols = info.stats.length <= 1 ? 1 : 2;
  const cellW = width / cols;
  const cellH = 240;
  ctx.textAlign = 'center';
  info.stats.forEach((s, i) => {
    const cx = x + (i % cols) * cellW + cellW / 2;
    const cy = y + Math.floor(i / cols) * cellH;
    ctx.font = `800 96px ${FONT}`;
    ctx.fillStyle = ACCENT;
    ctx.fillText(s.value, cx, cy, cellW - 24);
    ctx.font = `500 34px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(s.label, cx, cy + 118, cellW - 24);
  });
  ctx.textAlign = 'left';
}

/** 타임라인: 수직선 + 점 + 시점/라벨 */
function renderTimeline(
  ctx: CanvasRenderingContext2D,
  info: Extract<PlanInfographic, { type: 'timeline' }>,
  { x, y, width }: Layout,
): void {
  const lineX = x + 20;
  const textX = x + 64;
  const textW = width - 64;
  let cy = y;
  info.events.forEach((e, i) => {
    ctx.font = `700 32px ${FONT}`;
    const timeLines = wrapLines(ctx, e.time, textW);
    ctx.font = `500 36px ${FONT}`;
    const labelLines = wrapLines(ctx, e.label, textW);
    const rowH = timeLines.length * 40 + labelLines.length * 46 + 40;
    if (i < info.events.length - 1) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(lineX, cy + 8);
      ctx.lineTo(lineX, cy + rowH);
      ctx.stroke();
    }
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(lineX, cy + 16, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 32px ${FONT}`;
    let ty = cy;
    for (const l of timeLines) {
      ctx.fillText(l, textX, ty);
      ty += 40;
    }
    ctx.font = `500 36px ${FONT}`;
    ctx.fillStyle = ITEM_COLOR;
    for (const l of labelLines) {
      ctx.fillText(l, textX, ty);
      ty += 46;
    }
    cy += rowH;
  });
}

/** 형태(type) → 바디 렌더러. 새 형태 추가 = 여기 한 줄 + 렌더러 함수 */
const BODY_RENDERERS: {
  [K in InfographicType]: (
    ctx: CanvasRenderingContext2D,
    info: Extract<PlanInfographic, { type: K }>,
    layout: Layout,
  ) => void;
} = {
  list: (ctx, info, l) => renderBadgedItems(ctx, info.items, l, false),
  steps: (ctx, info, l) => renderBadgedItems(ctx, info.steps, l, true),
  table: renderTable,
  bar: renderBar,
  comparison: renderComparison,
  stat: renderStat,
  timeline: renderTimeline,
};

/** 공통 셋업: 캔버스/배경/키커/제목. 콘텐츠 시작 layout 반환. 브라우저 전용(SSR 은 null) */
function setup(
  info: PlanInfographic,
  version: VersionMode,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; layout: Layout } | null {
  if (typeof document === 'undefined') return null;
  const height = frameHeight(version);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const contentW = WIDTH - PAD * 2;
  let y = PAD;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, y, 72, 8);
  y += 36;
  ctx.fillStyle = MUTED;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('인포그래픽', PAD, y);
  y += 60;
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `700 60px ${FONT}`;
  for (const l of wrapLines(ctx, info.title, contentW)) {
    ctx.fillText(l, PAD, y);
    y += 76;
  }
  y += 40;
  return { canvas, ctx, layout: { x: PAD, y, width: contentW, bottom: height - PAD } };
}

/**
 * 인포그래픽(다형) → PNG data URL. 형태(type)로 렌더러를 디스패치. 브라우저 전용(SSR 은 빈 문자열)
 * 미지 type 은 제목만 렌더(그레이스풀). 실패 시 빈 문자열: 호출부(PlanBatch)가 error 로 처리
 */
export function renderInfographicImage(info: PlanInfographic, version: VersionMode): string {
  const s = setup(info, version);
  if (!s) return '';
  const render = BODY_RENDERERS[info.type] as
    | ((ctx: CanvasRenderingContext2D, info: PlanInfographic, layout: Layout) => void)
    | undefined;
  render?.(s.ctx, info, s.layout);
  return s.canvas.toDataURL('image/png');
}
