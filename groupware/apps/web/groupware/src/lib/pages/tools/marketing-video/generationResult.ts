// 생성 결과(결과 확인 화면)의 뷰모델
//
// 진행 화면이 끝나면 세그먼트가 하나의 최종 영상으로 병합되어 이 값이 만들어진다. 화면은 그것을
// 보여주고 내려받게 하며, 그 영상의 한 프레임으로 썸네일까지 만들 수 있다.
//
// generationProgress.ts 와 같은 이음새 규칙을 따른다: 화면은 이 타입 하나만 받고, 만드는 쪽이
// 실제 렌더 결과로 바뀌어도 화면은 그대로다.
import type { GenerationProgress } from './generationProgress';

export interface GenerationResult {
  // 병합된 최종 영상의 재생 주소. 없을 수 있다.
  //
  // 없으면 미리보기도 다운로드도 프레임 선택도 할 수 없고, 화면이 그 사실을 말한다. 지어낸 주소로
  // 채우면 눌러 본 뒤에야 드러난다.
  videoUrl: string | null;
  // 대표 이미지 주소. 영상 프레임을 못 쓸 때 썸네일의 바탕이 된다.
  //
  // 영상과 별개인 이유: 프레임을 고르려면 영상 전체를 받아 되감아야 하는데, 그것이 늘 되는 것은
  // 아니다(주소가 아직 없거나, 로드에 실패하거나, 재생만 되고 캔버스로 옮기지 못하는 경우). 그때
  // 이 한 장이 있으면 썸네일 만들기가 통째로 막히지는 않는다. 프레임을 고르는 일만 못 한다.
  posterUrl: string | null;
  // 최종 영상 길이(초). 모르면 null.
  durationSec: number | null;
  // 합쳐진 세그먼트 수
  segmentCount: number;
  // 어떤 영상 모델로 만들었는지. 빈 문자열이면 그 줄을 그리지 않는다.
  videoModel: string;
  // 완료 시각(epoch ms)
  completedAt: number;
  // 저장 파일명의 기준. 비어 있으면 기본 이름을 쓴다.
  title: string;
  // 같은 영상의 외부 보관 주소(Google Drive 등). 없으면 그 줄과 안내 문장이 함께 사라진다.
  //
  // 자리를 미리 두는 이유: 이 값을 넣는 곳이 생겼을 때 화면을 고칠 일이 없어야 한다. 반대로 지금
  // 그럴듯한 주소를 채워 두면 눌러 본 뒤에야 아무 데도 가지 않는다는 것이 드러난다.
  driveUrl: string | null;
}

/**
 * 진행 상태에서 결과를 만든다. 아는 것만 채운다.
 *
 * 길이는 완료된 세그먼트 길이의 합이다. 하나라도 길이를 모르면 합계도 모르는 것이라 null 로 둔다.
 * (모르는 조각을 0 으로 세면 24초짜리가 16초로 적힌다)
 *
 * 주소 셋(영상, 대표 이미지, 외부 보관)은 여기서 채우지 않는다. 그것들은 서버가 실어 보내야 알 수
 * 있고, 지어내면 눌러 본 뒤에야 드러난다. 만드는 쪽이 알고 있으면 반환값에 얹는다.
 */
export function resultFromProgress(
  progress: GenerationProgress,
  meta: { videoModel: string; title: string; completedAt: number },
): GenerationResult {
  const done = progress.segments.filter((s) => s.status === 'done');
  const knowsEvery = done.every((s) => s.durationSec != null);
  return {
    videoUrl: null,
    posterUrl: null,
    driveUrl: null,
    durationSec: knowsEvery ? done.reduce((sum, s) => sum + (s.durationSec ?? 0), 0) : null,
    segmentCount: done.length,
    videoModel: meta.videoModel,
    completedAt: meta.completedAt,
    title: meta.title,
  };
}

/** 재생 시간 표기 `00:24`. 분을 넘겨도 같은 자리수로 읽히게 둘 다 채운다. */
export function durationLabel(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 영상 길이 줄: `24초 (세그먼트 3개)`.
 *
 * 길이를 모르면 세그먼트 수만 말한다. `0초` 라고 적으면 길이가 0 인 영상이 만들어진 것처럼 읽힌다.
 */
export function lengthSummary(result: GenerationResult): string {
  const segments = `세그먼트 ${result.segmentCount}개`;
  return result.durationSec == null
    ? segments
    : `${Math.round(result.durationSec)}초 (${segments})`;
}

/**
 * 링크를 표 안에 넣을 짧은 형태로 줄인다: `drive.google.com/file/d/1a2B3c.../view`.
 *
 * 표의 값 칸은 좁은데 보관 주소는 길다. 그대로 두면 한 줄이 표 높이를 두세 배로 늘리고, 그 줄만
 * 눈에 띄어 위의 실제 정보를 가린다. 가운데를 줄이는 이유는 주소의 양 끝(어느 서비스인가, 어떤
 * 형태의 링크인가)이 정보의 대부분이기 때문이다.
 */
export function shortLinkLabel(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  if (withoutScheme.length <= 44) return withoutScheme;
  return `${withoutScheme.slice(0, 28)}...${withoutScheme.slice(-10)}`;
}

/** 완료 시각 표기 `2026-08-15 14:36:12`. 로컬 시간대로 적는다(사용자가 그 시계로 일한다) */
export function completedAtLabel(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
