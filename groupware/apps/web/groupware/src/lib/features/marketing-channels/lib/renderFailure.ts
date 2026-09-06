/**
 * 렌더 실패 사유 코드 → 우하단 알림 문구.
 *
 * 값 공간은 렌더(video-model `RenderFailure`)가 소유하고 여기는 사람이 읽을 말만 정한다. 서버의
 * `error` 는 벤더 원문이 섞인 진단용 한 줄이라 아는 코드에는 보이지 않고 로그와 DB 에만 남는다.
 * 문장으로 한도와 크레딧을 가르면 벤더가 문구를 바꾸는 날 조용히 어긋나므로 판정은 코드로만 한다.
 *
 * 모르는 코드는 일반 실패로 접고 그때만 서버 문장을 그대로 보인다. 서버가 사유를 늘려도 화면은
 * 깨지지 않는다.
 */
import type { ToastAction } from '$lib/shared/lib/stores/toastStore/toast.types';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import { isRenderingStatus, type RenderStatus } from '../types';

/** 알림이 읽는 최소 형태: 원천영상과 최종영상이 구조적으로 만족한다. */
export interface FailedRender {
  id: number;
  title: string;
  renderStatus: RenderStatus;
  error?: string | null;
  errorCode?: string | null;
  // 이 영상을 만든 모델(카탈로그 key). 벤더 고유 안내(한도 초기화 시각)를 붙일지 정한다.
  videoModel?: string;
}

/** 알림 버튼이 부를 동작. 화면이 주소를 알고 있어 여기서는 이름만 정한다. */
export interface RenderFailureActions {
  // AI 모델 설정 섹션을 연다(한도, 크레딧, 키 문제는 모델을 바꾸거나 키를 고치는 곳이 같다)
  openModelSettings?: () => void;
}

/** 취소 알림 한 건의 표시 내용 */
export interface CancellationNotice {
  // "「제목」 " 뒤에 붙는 제목의 뒷말
  reason: string;
  detail: string;
  action?: ToastAction;
}

// 렌더가 보내는 실패 사유 코드. 값 공간의 주인은 video-model 의 render_failure.py 이고 이 목록은 그 사본이다.
//   서버가 코드를 더하면 여기와 아래 표에 한 줄씩 더한다. 표가 이 타입으로 잠겨 있어 빠뜨리면 컴파일이 잡는다.
export const RENDER_FAILURE_CODES = [
  'rate_limited',
  'quota_exceeded',
  'credit_exhausted',
  'credential_missing',
  'content_rejected',
  'vendor_refused',
  'input_missing',
] as const;

export type RenderFailureCode = (typeof RENDER_FAILURE_CODES)[number];

/** 서버가 준 코드가 화면이 아는 코드인가. 모르는 코드는 일반 실패로 접는다 */
export function isRenderFailureCode(value: unknown): value is RenderFailureCode {
  return typeof value === 'string' && (RENDER_FAILURE_CODES as readonly string[]).includes(value);
}

const CANCELLED_DEFAULT = '만들기가 취소되었습니다';

const FALLBACK_DETAIL =
  '생성을 완료할 수 없어 작업이 취소되었습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.';

// Gemini 의 일일 한도는 태평양 자정에 초기화된다. 서머타임에 따라 한국 시간 16시 또는 17시다.
const GEMINI_RESET_HINT = ' Gemini 는 태평양 시간 자정(한국 시간 오후 4시에서 5시 사이)에 다시 열립니다.';

interface Notice {
  reason: string;
  detail: string;
  action?: keyof RenderFailureActions;
  actionLabel?: string;
}

// 코드별 문구. 제목은 무슨 일인지, 내용은 무엇을 하면 되는지를 말한다.
const NOTICES: Record<RenderFailureCode, Notice> = {
  // 취소로 끝난 한도 실패. 대개는 스위퍼가 quota_exceeded 로 바꿔 보내므로 드물다
  rate_limited: {
    reason: '요청이 몰려 만들지 못했어요',
    detail: '영상 모델에 요청이 몰린 상태가 이어졌어요. 잠시 후 다시 만들어 주세요.',
  },
  quota_exceeded: {
    reason: '오늘 만들 수 있는 횟수를 모두 썼어요',
    detail:
      '이 영상 모델은 하루에 보낼 수 있는 요청 수가 정해져 있어요. 지금 만들려면 설정에서 다른 영상 모델을 고르세요.',
    action: 'openModelSettings',
    actionLabel: '영상 모델 바꾸기',
  },
  credit_exhausted: {
    reason: '영상 모델 크레딧이 부족해요',
    detail: '벤더 계정에 결제를 채운 뒤 다시 만들어 주세요. 다른 영상 모델로 바꿔도 됩니다.',
    action: 'openModelSettings',
    actionLabel: '영상 모델 설정 열기',
  },
  credential_missing: {
    reason: '영상 모델 API 키가 없어요',
    detail: '환경설정에서 이 모델의 API 키를 등록하거나, 키가 있는 다른 영상 모델을 고르세요.',
    action: 'openModelSettings',
    actionLabel: '영상 모델 설정 열기',
  },
  content_rejected: {
    reason: '영상 모델이 이 장면을 거부했어요',
    detail: '안전 정책에 걸린 장면이 있어요. 인물이나 표현을 조금 바꿔 다시 만들어 보세요.',
  },
  vendor_refused: {
    reason: '영상 모델이 요청을 거절했어요',
    detail: '모델 쪽 사정으로 요청이 거절됐어요. 잠시 후 다시 만들거나 다른 영상 모델을 고르세요.',
    action: 'openModelSettings',
    actionLabel: '영상 모델 바꾸기',
  },
  input_missing: {
    reason: '영상에 넣을 파일을 찾을 수 없어요',
    detail: '이미지나 배경음 파일이 삭제되거나 만료됐어요. 파일을 다시 올린 뒤 만들어 주세요.',
  },
};

/**
 * 취소 알림 한 건의 표시 내용을 만든다.
 * 아는 코드면 사람 말과 버튼을, 모르는 코드면 사유 없는 기본 제목과 서버 문장을 쓴다.
 */
export function cancellationNotice(
  item: Pick<FailedRender, 'error' | 'errorCode' | 'videoModel'>,
  actions: RenderFailureActions = {},
): CancellationNotice {
  if (!isRenderFailureCode(item.errorCode)) {
    return { reason: CANCELLED_DEFAULT, detail: item.error?.trim() || FALLBACK_DETAIL };
  }
  const notice = NOTICES[item.errorCode];
  let detail = notice.detail;
  if (item.errorCode === 'quota_exceeded' && item.videoModel?.startsWith('gemini/')) {
    detail += GEMINI_RESET_HINT;
  }
  const run = notice.action ? actions[notice.action] : undefined;
  return {
    reason: notice.reason,
    detail,
    ...(run && notice.actionLabel ? { action: { label: notice.actionLabel, run } } : {}),
  };
}

// 아직 렌더 중인데 벤더 한도에 걸린 것. 서버가 간격을 두고 다시 보내고, 되풀이되면 quota_exceeded 로
//   확정해 취소 알림이 따로 뜬다. 그래서 여기서는 기다리라고만 말한다.
const RATE_LIMITED: RenderFailureCode = 'rate_limited';

const RATE_LIMITED_DETAIL =
  '영상 모델에 요청이 몰려 순서를 기다리고 있어요. 자동으로 이어서 만드니 그대로 두셔도 됩니다.';

// 한 번 알린 항목. 진행 중 알림은 서버가 한 번만 실어 주지 못한다(같은 상태가 폴링마다 온다).
//   취소 알림과 달리 자동 소멸하는 경고라, 병합 키만으로는 사라진 뒤 다음 폴링에 다시 뜬다.
//   탭 수명에만 유효한 기억이고 그래도 된다. 새로고침 뒤 한 번 더 보는 것은 도배가 아니다.
const notifiedLimits = new Set<string>();

/**
 * 렌더 중 한도에 걸린 항목을 경고로 알린다(항목마다 한 번). 호출부는 목록을 그대로 넘긴다.
 * 종류(kind)는 병합 키와 문구에 쓴다(원천영상과 최종영상이 같은 id 를 가질 수 있다).
 */
export function notifyRenderLimits(
  items: readonly FailedRender[] | undefined,
  kind: string,
): void {
  if (!items?.length) return;
  for (const item of items) {
    if (item.errorCode !== RATE_LIMITED || !isRenderingStatus(item.renderStatus)) continue;
    const key = `render-limit:${kind}:${item.id}`;
    if (notifiedLimits.has(key)) continue;
    notifiedLimits.add(key);
    toastStore.show({
      variant: 'warning',
      title: `${kind} 「${item.title}」 영상 모델 순서를 기다리는 중`,
      detail: RATE_LIMITED_DETAIL,
      key,
    });
  }
}

/** 테스트 전용: 알린 기억을 비운다. */
export function resetRenderLimitNotices(): void {
  notifiedLimits.clear();
}
