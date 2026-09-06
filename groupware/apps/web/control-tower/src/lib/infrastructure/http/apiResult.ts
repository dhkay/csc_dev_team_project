// 같은 origin BFF 응답({success,data}) 처리용 결과 봉투 + 공용 실행 헬퍼(앱 공용 단일 출처)
// 모든 feature apis 가 이 하나를 공유한다(도메인별 run() 복붙 제거). 컴포넌트/쿼리가 소비
import { isHttpError } from '$lib/infrastructure/http';

/** 컴포넌트/쿼리 소비용 결과 봉투 */
export type ApiResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errorCode?: string; error?: string };

type RawEnvelope<T> = { success?: boolean; data?: T; errorCode?: string; error?: string };

/** BFF 호출을 감싸 봉투를 풀고, HTTP 에러도 결과 봉투로 정규화한다. */
export async function run<T>(op: () => Promise<{ data: RawEnvelope<T> }>): Promise<ApiResult<T>> {
  try {
    const body = (await op()).data;
    if (body?.success) return { success: true, data: body.data as T };
    return { success: false, errorCode: body?.errorCode, error: body?.error };
  } catch (e) {
    if (isHttpError(e)) {
      const body = e.response?.data as unknown as RawEnvelope<T> | undefined;
      return { success: false, errorCode: body?.errorCode, error: body?.error ?? e.message };
    }
    return { success: false, error: '네트워크 오류로 실패했습니다.' };
  }
}
