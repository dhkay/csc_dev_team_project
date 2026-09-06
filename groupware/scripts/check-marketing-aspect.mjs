/**
 * 마케팅 영상 화면비 일치 검사 (CI 게이트).
 *
 * 화면비의 해석(비율 문자열 → 생성 크기, CSS 값)은 공유 커널 `@csc/video-capabilities` 가, 어느
 * 비율을 쓰는지는 버전 사실 표 `@csc/tool-versions` 가 소유한다. TypeScript 소비자(web-groupware,
 * csc-marketing)는 둘을 import 하므로 어긋날 방법이 없다. 하지만 렌더러는 Python 이라 그 값을
 * import 할 수 없고, 자기 픽셀표(`ffmpeg_ops._DIMS`)와 폴백(`DEFAULT_ASPECT`)을 문자열로 들고 있다.
 *
 * 그 둘이 갈리면 조용하다. 화면비를 못 알아들은 요청(구 잡, 오타, 새 버전 추가 직후)이 에러
 * 없이 폴백 모양으로 렌더되고, 결과 영상을 열어 봐야 드러난다.
 *
 * 그래서 넷을 본다.
 *   1. 각 버전이 선언한 화면비가 커널이 아는 값인가(`AspectRatio` 유니온).
 *   2. 그 값이 렌더러 픽셀표에 화질 등급마다 있는가. 빠진 값은 폴백으로 접힌다.
 *   3. 렌더러 폴백 자체가 커널이 아는 값인가.
 *   4. 최종 합성이 있는 버전은 그 화면비가 프레임 안전 구역에 가장 잘 들어가는 값인가.
 *      그 버전의 영상은 배경 프레임 안의 한 자리에 앉으므로, 자리에 맞지 않는 화면비는 그 자리를
 *      비워 두고 해상도까지 버린다(9:16 으로 만들던 동안 자리의 62%만 쓰고 704x1280 이 437x794 로
 *      줄었다). 그 자리는 프레임 제작 규약(ffmpeg_ops.FRAME_CONVENTION_ASPECT)과 안전 구역
 *      (ass_builder._SAFE_*_PCT)에서 나오므로, 어느 쪽을 바꿔도 이 검사가 화면비를 함께 보라고 알려 준다.
 *
 * "커널의 현재 화면비 하나 == 렌더러 폴백" 을 보는 검사는 버전마다 화면비가 갈린
 * 뒤로 성립하지 않는다(v1.0 의 영상은 배경 프레임 안의 한 자리에 앉고 v1.5 의 영상은 화면 전체다).
 * 지금 지켜야 하는 것은 한 값의 일치가 아니라 선언된 모든 값이 렌더러에서 크기를 얻는가 다.
 *
 * 형제 게이트였던 `check-marketing-scene-images.mjs` 는 사라졌다. 그쪽이 지키던 짝(화면 선언 ↔
 * 서버 선언)은 공유 커널 `@csc/tool-versions` 로 합쳐져 대조할 사본이 없다. 이 게이트가 남는
 * 이유는 짝의 성격이 다르기 때문이다. 여기서 맞춰야 하는 상대는 TypeScript 가 아니라 파이썬
 * 렌더러라 커널을 import 할 수 없다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const KERNEL = join(ROOT, 'packages', 'video-capabilities', 'src', 'aspect.ts');
const VERSIONS = join(ROOT, 'packages', 'tool-versions', 'src', 'pipeline.ts');
const RENDERER_DIR = join(
  ROOT, 'apps', 'api', 'fastapi', 'video-model', 'app', 'domains', 'video',
  'adapters', 'outbound', 'processing',
);
const RENDERER = join(RENDERER_DIR, 'ffmpeg_ops.py');
const OVERLAY = join(RENDERER_DIR, 'ass_builder.py');

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`[aspect] 파일을 읽지 못했습니다: ${relative(ROOT, path)}`);
    console.error('  파일이 옮겨졌다면 이 스크립트의 경로 상수를 함께 고칩니다.');
    process.exit(1);
  }
}

function fail(message) {
  console.error(`[aspect] ${message}`);
  process.exit(1);
}

/** 공유 커널이 아는 화면비 전체(AspectRatio 유니온). */
function kernelKnownRatios(source) {
  const m = /export type AspectRatio\s*=\s*([^;]+);/.exec(source);
  if (!m) fail('공유 커널에서 AspectRatio 유니온을 찾지 못했습니다.');
  const ratios = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (ratios.length === 0) fail('AspectRatio 유니온 항목을 읽지 못했습니다.');
  return ratios;
}

/** 버전 사실 표가 선언한 화면비(버전 이름 → 비율). */
function versionRatios(source) {
  // 버전 키(`'v1.0': { … aspectRatio: '4:5', … }`)를 앞에서 찾아 짝지운다. 이름을 함께 읽는 이유는
  //   실패 메시지가 어느 버전인지 말해야 고칠 자리를 찾을 수 있기 때문이다.
  const entries = [...source.matchAll(/'(v[\d.]+)'\s*:\s*\{/g)];
  if (entries.length === 0) fail('버전 사실 표에서 버전 항목을 찾지 못했습니다.');
  return entries.map(({ 1: version, index }) => {
    const block = source.slice(index);
    const m = /aspectRatio:\s*'([^']+)'/.exec(block);
    if (!m) fail(`버전 ${version} 에서 aspectRatio 선언을 찾지 못했습니다.`);
    const composite = /usesFinalComposite:\s*(true|false)/.exec(block);
    if (!composite) fail(`버전 ${version} 에서 usesFinalComposite 선언을 찾지 못했습니다.`);
    return { version, ratio: m[1], composite: composite[1] === 'true' };
  });
}

/** 렌더러의 폴백 화면비. */
function rendererDefault(source) {
  const m = /^DEFAULT_ASPECT\s*=\s*"([^"]+)"/m.exec(source);
  if (!m) fail('렌더러에서 DEFAULT_ASPECT 를 찾지 못했습니다.');
  return m[1];
}

/** 배경 프레임 제작 규약(프레임의 화면비). */
function frameConventionAspect(source) {
  const m = /^FRAME_CONVENTION_ASPECT\s*=\s*"([^"]+)"/m.exec(source);
  if (!m) fail('렌더러에서 FRAME_CONVENTION_ASPECT 를 찾지 못했습니다.');
  return m[1];
}

/** 프레임 안전 구역(캔버스 높이 대비 %, 위/아래) = 영상이 앉는 자리. */
function safeBandPct(source) {
  const top = /^_SAFE_TOP_PCT\s*=\s*([\d.]+)/m.exec(source);
  const bottom = /^_SAFE_BOTTOM_PCT\s*=\s*([\d.]+)/m.exec(source);
  if (!top || !bottom) fail('오버레이에서 _SAFE_TOP_PCT / _SAFE_BOTTOM_PCT 를 찾지 못했습니다.');
  const band = Number(bottom[1]) - Number(top[1]);
  if (!(band > 0)) fail(`안전 구역의 높이가 0 이하입니다: ${top[1]}% ~ ${bottom[1]}%`);
  return band / 100;
}

/** 'w:h' → [w, h]. 형식이 아니면 실패(조용히 NaN 으로 흐르지 않게). */
function ratioParts(ratio) {
  const m = /^(\d+):(\d+)$/.exec(ratio);
  if (!m) fail(`화면비 형식이 아닙니다: ${ratio}`);
  return [Number(m[1]), Number(m[2])];
}

/**
 * 그 화면비의 영상이 자리를 얼마나 채우는가(0~1). 자리에 비율 그대로 앉으므로(잘리지도
 * 늘어나지도 않는다) 남는 여백은 프레임이 보이는 부분이다.
 */
function boxFill(ratio, boxW, boxH) {
  const [w, h] = ratioParts(ratio);
  const scale = Math.min(boxW / w, boxH / h);
  return ((w * scale) * (h * scale)) / (boxW * boxH);
}

/** 렌더러 픽셀표(_DIMS)의 화질 등급별 화면비 키. */
function rendererDimsKeys(source) {
  const at = source.indexOf('_DIMS');
  if (at === -1) fail('렌더러에서 _DIMS 를 찾지 못했습니다.');
  const open = source.indexOf('{', at);
  const close = source.indexOf('\n}', open);
  if (open === -1 || close === -1) fail('_DIMS 블록의 범위를 읽지 못했습니다.');
  const body = source.slice(open, close);
  // 화질 등급 블록마다 그 안의 화면비 키를 모은다: `"720p": { "9:16": (...), ... }`
  const grades = [...body.matchAll(/"(\d+p)"\s*:\s*\{([^}]*)\}/g)];
  if (grades.length === 0) fail('_DIMS 에서 화질 등급 블록을 읽지 못했습니다.');
  return grades.map(([, grade, block]) => ({
    grade,
    ratios: [...block.matchAll(/"([^"]+)"\s*:\s*\(/g)].map((x) => x[1]),
  }));
}

const known = kernelKnownRatios(read(KERNEL));
const versions = versionRatios(read(VERSIONS));
const rendererSource = read(RENDERER);
const fallback = rendererDefault(rendererSource);
const dims = rendererDimsKeys(rendererSource);
const frameAspect = frameConventionAspect(rendererSource);
const safeBand = safeBandPct(read(OVERLAY));

// 1. 버전이 선언한 값이 커널이 아는 값인가.
const unknown = versions.filter(({ ratio }) => !known.includes(ratio));
if (unknown.length > 0) {
  console.error('[aspect] 버전이 커널이 모르는 화면비를 선언했습니다.\n');
  for (const { version, ratio } of unknown) console.error(`  ${version}: ${ratio}`);
  console.error(`\n  커널이 아는 값: ${known.join(', ')}`);
  console.error(`  값을 늘리려면 ${relative(ROOT, KERNEL)} 의 AspectRatio 유니온에 먼저 추가합니다.`);
  process.exit(1);
}

// 2. 그 값이 렌더러 픽셀표에 화질 등급마다 있는가. 선언되지 않은 값까지 요구하지 않는 이유:
//    유니온에는 아직 어느 버전도 쓰지 않는 값이 있을 수 있고, 쓰지 않는 값의 픽셀은 없어도 된다.
const declared = [...new Set(versions.map(({ ratio }) => ratio)), fallback];
const missing = dims
  .map(({ grade, ratios }) => ({ grade, absent: declared.filter((r) => !ratios.includes(r)) }))
  .filter(({ absent }) => absent.length > 0);
if (missing.length > 0) {
  console.error('[aspect] 렌더러 픽셀표(_DIMS)에 빠진 화면비가 있습니다.\n');
  for (const { grade, absent } of missing) {
    console.error(`  ${grade}: ${absent.join(', ')}`);
  }
  console.error('\n  빠진 값은 폴백으로 접혀, 고른 모양과 다른 모양이 말없이 나옵니다.');
  console.error('  버전이 새 화면비를 선언했다면 각 화질 등급에 한 줄씩 함께 추가합니다.');
  process.exit(1);
}

// 3. 폴백 자체가 커널이 아는 값인가(못 알아들은 요청이 닿는 자리다).
if (!known.includes(fallback)) {
  fail(`렌더러 폴백 '${fallback}' 이 커널의 AspectRatio 유니온에 없습니다: ${known.join(', ')}`);
}

// 4. 최종 합성이 있는 버전은 프레임 안전 구역에 가장 잘 들어가는 화면비를 써야 한다.
//    자리의 비율 = 프레임 가로 / (프레임 세로 * 안전 구역 높이 비율). 픽셀이 아니라 비율로 계산하는
//    이유: 프레임은 조직이 올리는 그림이라 픽셀이 매번 다르고, 자리의 모양만이 규약의 사실이다.
const [frameW, frameH] = ratioParts(frameAspect);
const boxW = frameW;
const boxH = frameH * safeBand;
const fills = known
  .map((ratio) => ({ ratio, fill: boxFill(ratio, boxW, boxH) }))
  .sort((a, b) => b.fill - a.fill);
const best = fills[0];
const misfit = versions
  .filter(({ composite }) => composite)
  .map(({ version, ratio }) => ({ version, ratio, fill: boxFill(ratio, boxW, boxH) }))
  .filter(({ ratio }) => ratio !== best.ratio);
if (misfit.length > 0) {
  console.error('[aspect] 프레임 안전 구역에 더 잘 들어가는 화면비가 있습니다.\n');
  for (const { version, ratio, fill } of misfit) {
    console.error(`  ${version}: ${ratio} (자리의 ${(fill * 100).toFixed(1)}% 사용)`);
  }
  console.error(`  가장 잘 들어가는 값: ${best.ratio} (${(best.fill * 100).toFixed(1)}%)`);
  console.error('\n  후보별 사용률:');
  for (const { ratio, fill } of fills) console.error(`    ${ratio}: ${(fill * 100).toFixed(1)}%`);
  console.error('\n  그 버전의 영상은 배경 프레임 안의 한 자리에 앉는다. 자리에 맞지 않는 화면비는');
  console.error('  그 자리를 비워 두고 해상도까지 버린다(결과 영상을 열어야 드러난다).');
  console.error(`  자리의 모양은 프레임 규약(${frameAspect})과 안전 구역(${(safeBand * 100).toFixed(1)}%)에서 나온다.`);
  process.exit(1);
}

const summary = versions.map(({ version, ratio }) => `${version}=${ratio}`).join(', ');
const composites = versions.filter(({ composite }) => composite);
const fitNote = composites.length
  ? `, 프레임 자리 사용률 ${composites
      .map(({ version, ratio }) => `${version} ${(boxFill(ratio, boxW, boxH) * 100).toFixed(1)}%`)
      .join(' / ')}`
  : '';
console.log(
  `[aspect] 버전별 화면비가 렌더러 픽셀표에 모두 있습니다: ${summary} ` +
    `(폴백 ${fallback}, 픽셀표 등급 ${dims.map((d) => d.grade).join(', ')}${fitNote})`,
);
