// 백엔드 어휘 → 진행 화면 어휘. 이 파일이 그 번역이 일어나는 유일한 자리다.
//
// 화면(GenerationProgressView)은 GenerationProgress 하나만 알고, 서버는 VideoProject 하나만 낸다.
// 둘 사이를 컴포넌트 안에서 옮기면 같은 매핑이 진행 화면과 결과 화면과 목록 카드에 각각 생기고,
// 렌더가 단계를 하나 더 알리기 시작할 때 그 셋이 따로 낡는다.
//
// 순수 함수만 둔다(입력 → 출력). 그래야 단계 표를 테스트가 통째로 잠글 수 있다.
import type { VideoProject } from '$lib/features/marketing-channels/types';
import type {
  GenerationProgress,
  GenerationStage,
  SegmentProgress,
  SegmentStatus,
} from './generationProgress';
import type { GenerationResult } from './generationResult';

/** 이 화면이 관측할 수 있는 것으로부터 단계를 정한다. */
export interface RenderObservation {
  // 입력을 세그먼트로 나누는 LLM 호출이 지금 돌고 있는가. 프로젝트가 생기기 전의 유일한 관측이다.
  //
  // 이 화면은 '기획' 이라는 말을 쓰지 않는다. 영상을 만들라고 누른 사람에게 그 단계는 세그먼트를
  // 몇 개로 나눌지 정하는 시간이고, 나뉜 결과가 곧 아래 격자의 칸이다.
  splitting: boolean;
  // 진행 화면이 열린 시각(epoch ms). 경과 시간의 기준
  startedAt: number;
}

/**
 * 관측 → 단계
 *
 * | 관측                            | 단계                |
 * |---------------------------------|---------------------|
 * | 프로젝트 없음 + 나누는 중       | SPLITTING           |
 * | 프로젝트 없음 + 다 나눔         | PREPARING           |
 * | PENDING                         | PREPARING           |
 * | RENDERING + SCENES              | SEGMENT_GENERATING  |
 * | RENDERING + FINALIZING          | MERGING             |
 * | COMPLETED                       | COMPLETED           |
 *
 * 렌더 구간을 모르면(구 버전 서버, 값 누락) SEGMENT_GENERATING 으로 둔다. 렌더 시간의 대부분이
 * 그 구간이라 모를 때 가장 사실에 가깝고 진행 바가 뒤로 가지 않는다.
 *
 * 실패와 취소와 정체는 단계로 표현하지 않는다. 그것은 진행이 아니라 진행의 끝이고 화면이 따로 알린다.
 */
function stageFrom(project: VideoProject | null, obs: RenderObservation): GenerationStage {
  if (!project) return obs.splitting ? 'SPLITTING' : 'PREPARING';
  if (project.renderStatus === 'COMPLETED') return 'COMPLETED';
  if (project.renderStatus === 'PENDING') return 'PREPARING';
  return project.renderStage === 'FINALIZING' ? 'MERGING' : 'SEGMENT_GENERATING';
}

/**
 * 렌더가 쓰는 씬 상태 어휘 → 화면의 세그먼트 상태
 *
 * 값 공간은 렌더가 소유한다(`VideoProjectSegment.status`). 어휘가 셋으로 같으므로 이 함수는 좁히기만
 * 한다. 모르는 값은 대기로 둔다: 렌더가 값을 하나 더 만들어도 화면이 없는 상태를 지어내지 않고,
 * 격자가 비어 보이는 것으로 드러난다.
 */
function segmentStatusFrom(status: string): SegmentStatus {
  if (status === 'done') return 'done';
  if (status === 'running') return 'running';
  return 'waiting';
}

/**
 * 세그먼트 격자. 칸 수는 서버가 말한 것만 쓴다.
 *
 * 프로젝트가 세그먼트를 실어 보내면 그것을 쓰고, 아직이면 프로젝트의 씬 수만큼 대기 칸을 만든다.
 * 프로젝트가 없으면 격자가 없다. 몇 개가 될지는 그 시간에 서버가 정하는 중이라(입력을 정제해
 * 동영상 단위로 나눈다) 화면이 어림한 수로 칸을 그리면 틀린 수를 확신하듯 보여주게 된다. 실제로
 * 화면의 셈은 "동영상1 (0-8초)" 를 세지 못해 칸 하나를 그렸다가 넷으로 바뀌었다.
 *
 * 칸이 하나씩 생겨나지는 않는다. 프로젝트가 생기는 순간 씬 수가 확정되어 칸이 한 번에 나타난다.
 *
 * 실패 칸이 없는 이유는 `SegmentStatus` 에 적어 두었다(렌더가 잡 전체를 실패시킨다)
 */
function segmentsFrom(project: VideoProject | null): SegmentProgress[] {
  if (!project) return [];
  const reported = project.segments;
  if (reported && reported.length > 0) {
    return reported.map((s) => ({
      order: s.order,
      status: segmentStatusFrom(s.status),
      ...(s.durationSec != null ? { durationSec: s.durationSec } : {}),
      ...(s.clipUrl ? { previewUrl: s.clipUrl } : {}),
      ...(s.prompt ? { prompt: s.prompt } : {}),
    }));
  }
  return project.scenes.map((_, i) => ({ order: i + 1, status: 'waiting' as const }));
}

/** 관측한 프로젝트(없으면 null) → 진행 화면 값 */
export function progressFromProject(
  project: VideoProject | null,
  obs: RenderObservation,
): GenerationProgress {
  return {
    stage: stageFrom(project, obs),
    startedAt: obs.startedAt,
    segments: segmentsFrom(project),
  };
}

/** 결과 화면 값을 만들 때 화면이 함께 아는 것(서버가 내지 않는 표시용 값) */
export interface ResultMeta {
  // 생성에 쓴 영상 모델 key(정보 표시용)
  videoModel: string;
  // 받을 파일의 이름이 되는 제목
  title: string;
  // 완료를 관측한 시각(epoch ms)
  completedAt: number;
}

/**
 * 완료된 프로젝트 → 결과 화면 값
 *
 * 길이는 세그먼트 길이의 합이다. 결과 영상 자체를 재서 얻는 편이 정확하지만 그것은 브라우저가
 * 메타데이터를 받은 뒤에야 알 수 있고, 그때까지 화면이 길이 자리를 비워 두게 된다. 합은 즉시 알 수
 * 있고 실제와 거의 같다(이어붙이기는 길이를 더할 뿐이다)
 *
 * 한 칸이라도 길이를 모르면 합계도 모르는 것이라 null 로 둔다. 모르는 조각을 0 으로 세면
 * 24초짜리가 16초로 적힌다.
 *
 * 외부 보관 주소(driveUrl)는 아직 연동이 없어 비운다.
 */
export function resultFromProject(project: VideoProject, meta: ResultMeta): GenerationResult {
  const segments = segmentsFrom(project);
  const knowsEvery = segments.length > 0 && segments.every((s) => s.durationSec != null);
  return {
    videoUrl: project.resultUrl,
    posterUrl: project.thumbnailUrl,
    durationSec: knowsEvery
      ? segments.reduce((acc, s) => acc + (s.durationSec ?? 0), 0)
      : null,
    segmentCount: segments.length,
    videoModel: meta.videoModel,
    completedAt: meta.completedAt,
    title: meta.title,
    driveUrl: null,
  };
}
