// 진행 화면의 dev 전용 목
// 세그먼트 생성은 dev 에서 돌지 않아(모델 호출과 GPU 가 필요하다) 이 화면을 확인할 길이 목뿐
// 정적 import 금지. 부르는 쪽이 `import.meta.env.DEV` 안에서 `await import()` 로 수신
// (정적으로 이으면 이 데이터가 prod 번들에 실린다)
import type {
  GenerationProgress,
  GenerationStage,
  SegmentProgress,
} from '../generationProgress';
import { resultFromProgress, type GenerationResult } from '../generationResult';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { versionAspectHeightFactor } from '../marketingAspect';

/**
 * 프리뷰가 실제로 열어 보는 테스트 영상들(CC0)
 * 진짜 영상인 이유: 이 화면에서 깨지는 것은 대부분 영상을 다루는 부분이다(첫 프레임 표시, 재생,
 * 되감기, 캔버스로 옮겨 저장). 어느 것도 그림 한 장으로는 확인 불가
 * 이 주소인 이유: 캔버스 캡처에는 `Access-Control-Allow-Origin`, 되감기에는 Range 응답이 필요하고
 * 둘 다 확인했다. 열리지 않아도 화면은 멈추지 않는다(썸네일은 아래 자리표시 그림으로 떨어진다)
 */
const FLOWER = 'https://mdn.github.io/shared-assets/videos/flower.mp4'; // 실측 5.055초
const FRIDAY = 'https://mdn.github.io/shared-assets/videos/friday.mp4'; // 실측 6.166초
const RABBIT =
  'https://mdn.github.io/learning-area/html/multimedia-and-embedding/video-and-audio-content/rabbit320.mp4'; // 실측 7.800초

/**
 * 세그먼트가 쓸 클립들. 칸마다 다른 영상
 * 한 클립을 셋으로 잘라 쓰면 조각들이 거의 같아 보여, 어느 칸을 다시 만들지 고르는 판단을
 * 연습할 수 없다. 그래서 내용이 뚜렷이 다른 셋
 */
const SEGMENT_CLIPS: readonly string[] = [FLOWER, FRIDAY, RABBIT];

/**
 * 프리뷰 세그먼트 수 = 클립 수. 하나로 묶어 "칸마다 다른 영상" 을 정의로 삼음
 * 셋이면 격자와 상태 전환과 재생성을 다 확인할 수 있다(끝난 칸, 도는 칸, 대기 칸이 동시에 보인다)
 */
const SEGMENT_COUNT = SEGMENT_CLIPS.length;

/**
 * 조각 하나의 길이(초). 이 값이 곧 이어 붙이기에 걸리는 시간이다(녹화가 실시간이라 셋이면 세 배)
 * 칸의 내용을 판단하는 데는 1초로 충분하고 카드는 눌러 반복 재생
 */
const SEGMENT_SECONDS = 1;
/** 조각 길이의 합 = 결과 영상의 길이 */
const MERGED_SECONDS = SEGMENT_COUNT * SEGMENT_SECONDS;

/**
 * 이번 회차의 클립 배정. 열 때마다 다시 섞음
 * 늘 같은 순서면 두 번째부터는 그것을 배경으로 읽어 무엇이 바뀌었는지 알아채지 못함
 * 모듈 변수인 이유: 진행 상태는 화면의 계약이고 목의 사정을 담는 자리가 아니기 때문
 */
let sessionClips: readonly string[] = SEGMENT_CLIPS;

/** 순서를 섞는다(원본은 건드리지 않는다) */
function shuffled<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * 세그먼트 하나가 쓸 영상. 그 칸의 클립을 앞에서 `SEGMENT_SECONDS` 만큼만 재생
 * (미디어 프래그먼트 `#t=0,끝`). 칸 수와 클립 수가 같아 칸마다 다른 영상
 */
function sampleClipFor(order: number): string {
  return `${sessionClips[order - 1]}#t=0,${SEGMENT_SECONDS}`;
}

/**
 * 이어 붙이기를 못 했을 때 결과가 재생할 대역(녹화 미지원이거나 클립을 못 연 경우)
 * 길이를 조각 길이의 합과 맞춰 화면이 적는 수와 재생되는 영상의 어긋남 방지
 */
function fallbackMergedClip(): string {
  return `${sessionClips[0]}#t=0,${MERGED_SECONDS}`;
}

/** 프롬프트 예시. 세그먼트마다 달라야 재생성 창이 그 칸의 것을 열었는지 눈으로 확인 가능 */
const SAMPLE_PROMPTS = [
  '카페 창가에 앉은 인물의 손끝을 클로즈업으로 잡고, 잔잔한 감성 브이로그 톤으로 연출한다.',
  '제품을 쥔 손이 화면을 가로지르며 배경이 밝은 톤으로 전환되는 흐름을 담는다.',
  '완성된 장면을 넓게 잡아 마무리하고, 마지막 한 박자를 정적으로 남긴다.',
] as const;

/**
 * 프리뷰 한 틱(ms). 실제 소요 시간을 흉내 내지 않음
 * 여기서 보려는 것은 칸의 상태 전환과 진행 바가 뒤로 가지 않는지, 완료가 결과 화면으로 이어지는지다.
 * 전환이 일어나는 것이 확인 대상이지 얼마나 걸리는지가 아니라, 눈으로 좇을 수 있는 최소치
 * 화면에 적히는 시간(예상 소요, 세그먼트 길이, 경과)은 이 값과 무관하다.
 */
export const MOCK_TICK_MS = 500;

/** 이 칸의 프롬프트. 재생성 창이 이것을 열어 고친다(고친 값은 그 칸에 남는다) */
function promptFor(order: number): string {
  return SAMPLE_PROMPTS[(order - 1) % SAMPLE_PROMPTS.length];
}

/**
 * 만들어진 세그먼트 하나. 진짜 클립을 달아 카드가 그 영상을 그대로 표시하게 함
 * `prompt` 를 넘기면 그것을 유지(재생성으로 고쳐진 값). 없으면 이 칸의 기본 문장
 */
function doneSegment(order: number, prompt?: string): SegmentProgress {
  return {
    order,
    status: 'done',
    durationSec: SEGMENT_SECONDS,
    previewUrl: sampleClipFor(order),
    prompt: prompt ?? promptFor(order),
  };
}

/**
 * 목업의 첫 화면: 첫 칸은 끝났고 둘째가 도는 중, 나머지는 대기
 * 세 상태가 처음부터 함께 보이는 것이 목적이다(다 대기로 시작하면 완성된 칸의 모양을 보려고 기다린다)
 * 실패한 칸은 두지 않음. `advanceMock` 이 실패가 남아 있으면 멈춰 프리뷰가 완료에 닿지 못함
 * (실패 카드의 모양은 `SegmentStatusCard.svelte.test.ts` 가 네 상태를 모두 검사한다)
 */
export function mockGenerationProgress(): GenerationProgress {
  // 이번 회차의 배정을 다시 고름. 같은 순서가 반복되면 무엇이 바뀌었는지 눈에 띄지 않음
  sessionClips = shuffled(SEGMENT_CLIPS);
  const segments: SegmentProgress[] = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
    const order = i + 1;
    if (order === 1) return doneSegment(order);
    if (order === 2) return { order, status: 'running', etaSec: 24, prompt: promptFor(order) };
    return { order, status: 'waiting', prompt: promptFor(order) };
  });
  return {
    stage: 'SEGMENT_GENERATING',
    // 시작 시각을 조금 앞으로 당김. 0초부터면 경과가 늘 00:00:0x 라 시/분 자리를 확인 불가
    startedAt: Date.now() - 96_000,
    segments,
  };
}

/** 세그먼트 생성 이후의 단계 흐름. 마지막은 종료 상태라 여기서 멈춘다. */
const NEXT_STAGE: Partial<Record<GenerationStage, GenerationStage>> = {
  SEGMENT_GENERATING: 'MERGING',
  MERGING: 'COMPLETED',
};

/**
 * 한 틱 진행. 도는 세그먼트를 끝내고 다음 대기를 가동
 * 대기가 다 떨어지면 병합을 거쳐 완료까지 흐른다.
 */
export function advanceMock(p: GenerationProgress): GenerationProgress {
  const segments = p.segments.map((s) => ({ ...s }));
  const running = segments.find((s) => s.status === 'running');
  // 고쳐 둔 프롬프트를 지우지 않는다. 재생성 창에서 적은 값이 그 칸에 남아야 다시 열었을 때 보인다.
  if (running) Object.assign(running, doneSegment(running.order, running.prompt), {
    etaSec: undefined,
  });
  const next = segments.find((s) => s.status === 'waiting');
  if (next) {
    next.status = 'running';
    next.etaSec = 24;
    return { ...p, segments };
  }
  // 남은 대기가 없으면 다음 단계로
  return { ...p, stage: NEXT_STAGE[p.stage] ?? p.stage, segments };
}

/**
 * 완료된 진행 상태로 결과 생성
 * 세그먼트 수와 길이는 실제 진행 상태에서 나온다(resultFromProgress)
 * `mergedUrl` 은 `mergeMockSegments` 가 실제로 이어 붙인 영상. 못 만들었으면 길이만 맞춘 대역
 * 외부 보관 주소는 없음. 가리킬 곳이 실제로 없어 넣으면 눌러 본 뒤에야 드러남
 */
export function mockGenerationResult(
  p: GenerationProgress,
  mergedUrl: string | null,
  version: VersionMode,
): GenerationResult {
  return {
    ...resultFromProgress(p, {
      videoModel: 'VEO3',
      title: '마케팅 영상 미리보기',
      completedAt: Date.now(),
    }),
    videoUrl: mergedUrl ?? fallbackMergedClip(),
    posterUrl: mockPosterDataUrl(version),
  };
}

/**
 * 이어 붙이기가 만들 영상의 크기. 클립마다 크기가 달라 하나로 맞춰 그린다(넘치는 쪽은 잘린다)
 * 폭만 정하고 높이는 그 버전의 화면비에서 파생한다. 모양이 실제와 다르면 썸네일 편집기에서 문구를
 * 놓아 본 자리가 실제와 어긋남
 */
const MERGE_WIDTH = 720;
const mergeHeight = (version: VersionMode): number =>
  Math.round(MERGE_WIDTH * versionAspectHeightFactor(version));
/** 초당 프레임. 미리보기용이라 높일 이유 없음 */
const MERGE_FPS = 30;

/**
 * 클립 하나를 받는 데 기다려 주는 시간. 넘으면 받은 만큼으로 진행하거나 그 클립을 뺀다.
 * 넉넉히 두는 이유: 정상 회선에서 이 상한에 닿으면 화질만 손해다.
 */
const CLIP_LOAD_TIMEOUT_MS = 15_000;
/**
 * 조각 하나를 재생하는 데 기다려 주는 시간. 실제로는 SEGMENT_SECONDS 면 종료
 * 여유는 끝 신호가 오지 않는 브라우저를 위한 backstop 이다(그 경우 그 조각만 짧게 담긴다)
 */
const CLIP_PLAY_TIMEOUT_MS = SEGMENT_SECONDS * 1000 + 5_000;

/**
 * 세그먼트 영상들을 브라우저에서 실제로 이어 붙인다(dev 전용).
 *
 * 캔버스에 클립을 차례로 재생해 그리고 그 캔버스의 스트림을 녹화한다. 나오는 것이 진짜 파일
 * 하나라 결과 화면이 그것을 재생하고 되감고 썸네일까지 만든다. 길이만 맞춘 대역을 놓으면 화면이
 * 말하는 것과 재생되는 것이 다른 물건이 된다.
 *
 * 한계 셋. 녹화는 실시간을 벗어날 수 없고, 캔버스 스트림에 오디오 트랙이 없어 소리는 담기지
 * 않으며, webm 헤더에 길이가 없어 `duration` 이 Infinity 다. 그래서 결과의 `durationSec` 을
 * 화면이 함께 받아 스크러버의 상한으로 쓴다.
 */
export async function mergeMockSegments(
  p: GenerationProgress,
  version: VersionMode,
): Promise<string | null> {
  const urls = p.segments
    .filter((s) => s.status === 'done' && !!s.previewUrl)
    .map((s) => s.previewUrl as string);
  if (urls.length === 0) return null;
  if (typeof MediaRecorder === 'undefined') return null;

  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  if (!mimeType) return null;

  // 내려받기를 먼저 한꺼번에. 여기서 실패한 클립은 빼고 남은 것으로 연결
  const videos = (
    await Promise.all(urls.map((url) => loadClip(url, CLIP_LOAD_TIMEOUT_MS)))
  ).filter((v): v is HTMLVideoElement => !!v);
  if (videos.length === 0) return null;

  const height = mergeHeight(version);
  const canvas = document.createElement('canvas');
  canvas.width = MERGE_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    videos.forEach(releaseClip);
    return null;
  }
  // 첫 프레임이 그려지기 전의 한 틱을 검은 화면으로 두지 않기 위함
  drawCover(ctx, videos[0], height);

  const stream = canvas.captureStream(MERGE_FPS);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    // 녹화기가 스스로 죽는 경우에도 이 약속은 끝나야 한다(안 그러면 화면이 멈춘 채 남는다)
    recorder.onerror = () => resolve();
  });

  recorder.start();
  try {
    for (const video of videos) await playInto(ctx, video, height, CLIP_PLAY_TIMEOUT_MS);
  } finally {
    // 조각 하나가 던져도 녹화기와 스트림은 반드시 해제. 남기면 탭이 계속 녹화
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    videos.forEach(releaseClip);
  }

  if (chunks.length === 0) return null;
  return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
}

/**
 * 클립 하나를 재생 가능한 상태까지 받아 둔다. 못 받으면 null(그 클립만 빠진다)
 * 반드시 끝나는 약속이어야 한다. `canplaythrough` 는 가장 엄격한 신호라 회선이 느리면 성공도 실패도
 * 오지 않고, 그러면 화면이 '합치는 중' 에 멈춘 채 남음
 * 그래서 상한을 두고, 시간이 다하면 첫 프레임이라도 받았으면 그것으로 진행한다(그것마저 없으면 뺀다)
 */
function loadClip(url: string, timeoutMs: number): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    // 캔버스가 오염되면 녹화 스트림 자체가 막힌다(세그먼트 카드와 같은 이유)
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (value: HTMLVideoElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.oncanplaythrough = null;
      video.onerror = null;
      resolve(value);
    };
    const timer = window.setTimeout(
      () => finish(video.readyState >= video.HAVE_CURRENT_DATA ? video : null),
      timeoutMs,
    );

    video.oncanplaythrough = () => finish(video);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** 다 쓴 클립 해제. 두면 버퍼가 탭에 남음 */
function releaseClip(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

/**
 * 미리 받아 둔 클립을 끝까지 재생하며 캔버스에 렌더
 * 끝을 `ended` 하나로 판단하지 않는 이유: 이 클립들은 미디어 프래그먼트(`#t=0,N`)로 앞부분만
 * 재생하는데 그 끝에서 브라우저는 `ended` 가 아니라 `pause` 를 낸다. `ended` 만 기다리면 첫 조각에서
 * 약속이 끝나지 않고 녹화가 멈추지 않은 채 화면이 '합치는 중' 에 머문다.
 * 신호가 브라우저마다 달라 셋을 다 받고(`ended`/`pause`/`error`) 그중 아무것도 오지 않는 경우를
 * 위해 시간 상한을 둔다. 이 약속은 어떤 경우에도 종료
 * `pause` 를 재생이 시작된 뒤에만 끝으로 읽는 이유: `play()` 가 비동기라 그 전에도 멈춘 상태다.
 */
function playInto(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  height: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    let frame = 0;
    let started = false;
    let settled = false;
    // 디코드된 프레임마다 한 번씩만 렌더
    // `requestAnimationFrame` 은 주사율로 돌아 30fps 원본을 두 번 그리는데,
    // `requestVideoFrameCallback` 은 새 프레임이 나올 때만 불러 그리는 일이 절반
    // (없는 브라우저에서는 rAF 로 떨어진다. 결과는 같고 CPU 만 더 쓴다)
    // 끝 판정을 이 콜백에 두지 않는다: 멈추면 새 프레임이 없어 이 콜백도 함께 멈춘다.
    const useVideoFrame = typeof video.requestVideoFrameCallback === 'function';
    const paint = () => {
      drawCover(ctx, video, height);
      frame = useVideoFrame
        ? video.requestVideoFrameCallback(paint)
        : requestAnimationFrame(paint);
    };
    const stop = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (useVideoFrame) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      video.onended = null;
      video.onerror = null;
      video.onpause = null;
      video.onplaying = null;
      resolve();
    };
    const timer = window.setTimeout(stop, timeoutMs);

    video.onplaying = () => {
      started = true;
    };
    video.onended = stop;
    // 프래그먼트 끝에서 오는 신호(위 주석). 시작 전의 멈춤은 끝이 아님
    video.onpause = () => {
      if (started) stop();
    };
    // 재생 중 끊겨도 멈춘다. 그러지 않으면 약속이 끝나지 않아 녹화가 영영 이어진다.
    video.onerror = stop;
    // 자동재생이 막히면 play() 가 거절한다. 그 경우도 끝으로 본다(그리지 못할 뿐 흐름은 이어진다)
    void video.play().catch(stop);
    paint();
  });
}

/** 비율을 지키며 캔버스를 꽉 채운다(넘치는 쪽은 잘린다). object-fit: cover 와 같은 규칙 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  height: number,
): void {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (vw === 0 || vh === 0) return;
  const scale = Math.max(MERGE_WIDTH / vw, height / vh);
  const w = vw * scale;
  const h = vh * scale;
  ctx.drawImage(video, (MERGE_WIDTH - w) / 2, (height - h) / 2, w, h);
}

/**
 * 썸네일 바탕으로 쓸 자리표시 그림을 그려 data URL 로 반환
 * data URL 이라 같은 오리진이고 그 캔버스는 오염되지 않아 저장까지 그대로 확인 가능
 * 자리표시로 보이게 렌더. 진짜 프레임처럼 보이면 dev 에서 본 것을 실제 결과로 착각
 */
function mockPosterDataUrl(version: VersionMode): string {
  // 병합 영상과 같은 크기. 이 그림이 그 영상의 대표 이미지라 모양이 달라선 안 됨
  const width = MERGE_WIDTH;
  const height = mergeHeight(version);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#312e81');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 격자: 문구를 끌어 옮길 때 어디로 갔는지 좇을 기준선
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  // 세로선은 폭을, 가로선은 높이를 나눈다. 한 값으로 둘 다 나누면 정사각이 아닐 때 가로선이
  // 위쪽에만 몰려 아래를 짚을 기준이 사라진다.
  for (let i = 1; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo((width / 6) * i, 0);
    ctx.lineTo((width / 6) * i, height);
    ctx.moveTo(0, (height / 6) * i);
    ctx.lineTo(width, (height / 6) * i);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '500 28px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('미리보기용 자리표시 이미지', width / 2, height / 2);

  return canvas.toDataURL('image/png');
}

/** 세그먼트 하나 재생성: 그 칸만 생성 중으로 되돌림 */
export function regenerateMockSegment(
  p: GenerationProgress,
  order: number,
  prompt: string,
): GenerationProgress {
  return {
    ...p,
    // 재생성은 세그먼트 단계의 일. 병합까지 갔다가 되돌리면 단계도 함께 복귀 필요
    stage: 'SEGMENT_GENERATING',
    // 시도 횟수와 실패 사유는 넘기지 않는다(다시 도는 칸의 지난 실패는 더 이상 사실이 아니다)
    // 고친 프롬프트는 남긴다. 그 값으로 다시 만드는 것이 이 동작의 전부다.
    segments: p.segments.map((s) =>
      s.order === order ? { order: s.order, status: 'running', etaSec: 24, prompt } : s,
    ),
  };
}
