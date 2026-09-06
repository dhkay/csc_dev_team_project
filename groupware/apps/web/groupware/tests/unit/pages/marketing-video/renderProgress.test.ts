/**
 * 서버 관측 → 진행 화면 번역
 *
 * 이 표가 틀려도 예외는 나지 않는다. 화면이 세그먼트를 만드는 중인데 '영상 병합' 이라고 적거나,
 * 다 끝난 렌더를 진행 중으로 그려도 멀쩡히 그려진다. 그래서 표 자체를 여기서 잠근다.
 */
import { describe, it, expect } from 'vitest';
import {
  progressFromProject,
  resultFromProject,
  type RenderObservation,
} from '$lib/pages/tools/marketing-video/renderProgress';
import type {
  VideoProject,
  VideoProjectScene,
  VideoProjectSegment,
} from '$lib/features/marketing-channels/types';

const OBS: RenderObservation = { splitting: false, startedAt: 1_000 };

/** 프로젝트의 씬 하나. 격자의 칸 수는 세그먼트가 보고되기 전까지 이 배열의 길이다. */
function scene(order: number): VideoProjectScene {
  return { order, imageUploadId: '', narration: '', subtitle: { text: '' } };
}

function project(over: Partial<VideoProject> = {}): VideoProject {
  return {
    id: 100,
    channelId: 3,
    savedPlanId: 5,
    title: '기획안',
    aspectRatio: '9:16',
    resolution: '720p',
    videoModel: 'wan2.2-ti2v-5b',
    videoMode: '',
    ttsModel: 'edge-tts',
    ttsVoice: 'ko-KR-SunHiNeural',
    ttsPitch: '+0Hz',
    scenes: [],
    renderStatus: 'RENDERING',
    progress: null,
    renderStage: null,
    segments: null,
    resultUploadId: null,
    resultUrl: null,
    thumbnailUrl: null,
    placedAt: null,
    error: null,
    errorCode: null,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...over,
  };
}

function segment(over: Partial<VideoProjectSegment> = {}): VideoProjectSegment {
  return {
    order: 1,
    status: 'done',
    clipUploadId: 'clip-1',
    clipUrl: 'https://files/clip-1',
    durationSec: 4,
    prompt: '묘사 1',
    ...over,
  };
}

describe('progressFromProject 단계', () => {
  it('프로젝트가 없으면 기획 중인지 아닌지로 갈린다', () => {
    // 0% 짜리 정지 화면은 "모른다" 가 아니라 "아무 일도 없었다" 로 읽힌다. LLM 이 도는 동안
    //   그것은 사실이 아니라, 관측되는 유일한 진행(기획안 생성)을 단계로 옮긴다.
    expect(progressFromProject(null, { ...OBS, splitting: true }).stage).toBe('SPLITTING');
    expect(progressFromProject(null, { ...OBS, splitting: false }).stage).toBe(
      'PREPARING',
    );
  });

  it('잡이 등록만 되고 아직 안 집혔으면 프롬프트 생성이다', () => {
    // 세그먼트 격자는 아직 한 칸도 채워지지 않는다. 사용자에게는 보낼 준비를 하는 중이다.
    expect(progressFromProject(project({ renderStatus: 'PENDING' }), OBS).stage).toBe(
      'PREPARING',
    );
  });

  it('씬을 만드는 중이면 세그먼트 생성, 다 만들었으면 영상 병합이다', () => {
    const scenes = project({ renderStatus: 'RENDERING', renderStage: 'SCENES' });
    const finalizing = project({ renderStatus: 'RENDERING', renderStage: 'FINALIZING' });
    expect(progressFromProject(scenes, OBS).stage).toBe('SEGMENT_GENERATING');
    expect(progressFromProject(finalizing, OBS).stage).toBe('MERGING');
  });

  it('렌더 구간을 모르면 세그먼트 생성으로 둔다', () => {
    // 렌더 시간의 대부분이 그 구간이라 모를 때 가장 사실에 가깝고, 진행 바가 뒤로 가지 않는다.
    expect(progressFromProject(project({ renderStage: null }), OBS).stage).toBe(
      'SEGMENT_GENERATING',
    );
  });

  it('완료는 완료다', () => {
    expect(progressFromProject(project({ renderStatus: 'COMPLETED' }), OBS).stage).toBe(
      'COMPLETED',
    );
  });

  it('정체(STALLED)를 진행 단계로 옮기지 않는다', () => {
    // 그것은 진행이 아니라 진행이 멈춘 것이고, 화면이 따로 알린다. 단계로 옮기면 '세그먼트 생성'
    //   이라고 적힌 채 영원히 서 있게 된다(그 화면은 무엇이 잘못됐는지 말하지 않는다)
    const stalled = progressFromProject(project({ renderStatus: 'STALLED' }), OBS);
    expect(stalled.stage).toBe('SEGMENT_GENERATING');
  });
});

describe('progressFromProject 세그먼트', () => {
  it('프로젝트가 없으면 격자도 없다(칸 수를 어림하지 않는다)', () => {
    // 몇 개가 될지는 그 시간에 서버가 정하는 중이다(입력을 정제해 동영상 단위로 나눈다). 화면이
    //   브리프에서 번호를 세어 칸을 먼저 그리면 틀린 수를 확신하듯 보여준다("동영상1 (0-8초)" 는
    //   세지 못해 칸 하나를 그렸다가 넷으로 바뀌었다). 화면은 빈 격자를 "계산 중" 으로 그린다.
    expect(progressFromProject(null, { ...OBS, splitting: true }).segments).toEqual([]);
    expect(progressFromProject(null, OBS).segments).toEqual([]);
  });

  it('세그먼트가 보고되기 전에는 프로젝트의 씬 수만큼 대기 칸을 만든다', () => {
    // 프로젝트가 생기는 순간 씬 수가 확정되어 칸이 한 번에 나타난다. 칸이 하나씩 생겨나면 사용자가
    //   전체 분량을 가늠할 수 없다.
    const p = progressFromProject(
      project({ renderStatus: 'PENDING', scenes: [scene(1), scene(2), scene(3)], segments: null }),
      OBS,
    );
    expect(p.segments).toEqual([
      { order: 1, status: 'waiting' },
      { order: 2, status: 'waiting' },
      { order: 3, status: 'waiting' },
    ]);
  });

  it('보고된 세그먼트를 화면 어휘로 옮긴다', () => {
    const p = progressFromProject(
      project({
        segments: [
          segment({ order: 1, status: 'done' }),
          segment({ order: 2, status: 'running', clipUploadId: null, clipUrl: null, durationSec: null }),
          segment({ order: 3, status: 'waiting', clipUploadId: null, clipUrl: null, durationSec: null }),
        ],
      }),
      OBS,
    );
    expect(p.segments.map((s) => s.status)).toEqual(['done', 'running', 'waiting']);
    // 만들어진 칸은 그 자리에서 재생된다. 주소가 없으면 결과 영상을 끝까지 봐야 어느 칸을 다시
    //   만들지 알 수 있는데, 그 판단을 하라고 이 격자가 있다.
    expect(p.segments[0].previewUrl).toBe('https://files/clip-1');
    expect(p.segments[0].durationSec).toBe(4);
    // 묘사는 재생성 창이 고쳐 쓸 값이다.
    expect(p.segments[0].prompt).toBe('묘사 1');
  });

  it('모르는 상태 어휘는 대기로 둔다', () => {
    // 없는 상태를 지어내지 않는다. 렌더가 어휘를 늘려도 화면이 깨지지 않는다.
    const p = progressFromProject(
      project({ segments: [segment({ status: 'queued-somewhere' })] }),
      OBS,
    );
    expect(p.segments[0].status).toBe('waiting');
  });

  it('관측 기준 시각을 그대로 쓴다', () => {
    // 경과 시간의 기준이다. 폴링마다 다시 잡으면 시계가 계속 0 으로 되돌아간다.
    expect(progressFromProject(project(), OBS).startedAt).toBe(1_000);
  });
});

describe('resultFromProject', () => {
  const done = project({
    renderStatus: 'COMPLETED',
    resultUrl: 'https://files/final',
    thumbnailUrl: 'https://files/thumb',
    segments: [
      segment({ order: 1, durationSec: 4 }),
      segment({ order: 2, durationSec: 5 }),
    ],
  });
  const meta = { videoModel: 'wan2.2-ti2v-5b', title: '마케팅 영상', completedAt: 9_000 };

  it('서버가 준 주소를 그대로 쓴다', () => {
    const r = resultFromProject(done, meta);
    expect(r.videoUrl).toBe('https://files/final');
    expect(r.posterUrl).toBe('https://files/thumb');
    // 외부 보관 주소는 연동이 없다. 그럴듯한 주소를 채우면 눌러 본 뒤에야 드러난다.
    expect(r.driveUrl).toBeNull();
  });

  it('길이는 세그먼트 길이의 합이다', () => {
    expect(resultFromProject(done, meta).durationSec).toBe(9);
    expect(resultFromProject(done, meta).segmentCount).toBe(2);
  });

  it('한 칸이라도 길이를 모르면 합계도 모르는 것으로 둔다', () => {
    // 모르는 조각을 0 으로 세면 24초짜리가 16초로 적힌다.
    const partial = project({
      renderStatus: 'COMPLETED',
      segments: [segment({ order: 1, durationSec: 4 }), segment({ order: 2, durationSec: null })],
    });
    expect(resultFromProject(partial, meta).durationSec).toBeNull();
  });
});
