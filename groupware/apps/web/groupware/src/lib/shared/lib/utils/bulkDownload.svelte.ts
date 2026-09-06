/**
 * 선택분 일괄 다운로드 컨트롤러: 진행 상태(runes)를 들고 순차로 받는다.
 * 화면마다 상태 3개 + 루프를 다시 적지 않도록 정책을 한 곳에 둔다(워크스페이스 최종 탭, 보관함)
 *
 * 순차 처리인 이유: 동시에 받으면 수십 MB 짜리가 N개 메모리에 동시에 올라가고, 브라우저의
 * 다중 다운로드 차단에도 더 잘 걸린다.
 * 한 건이 실패해도 멈추지 않는다: 나머지를 받은 뒤 실패 개수만 알린다(하나 때문에 전부 날리지 않게)
 *
 * 파일 저장 자체(cross-origin blob 우회)는 downloadFile 이 담당한다. 여기선 진행/집계만
 */
import { downloadUrlAsFile } from './downloadFile';

export interface BulkDownloadItem {
  // 파일 접근 URL(서명 포함)
  url: string;
  // 저장 파일명의 기준(확장자 제외): 보통 항목 제목
  name: string;
}

export function createBulkDownload() {
  let done = $state(0);
  let total = $state(0);
  let error = $state<string | null>(null);

  return {
    /** 완료 건수(진행 표시용) */
    get done() {
      return done;
    },
    /** 이번 실행의 총 건수. 진행 중이 아니면 0. */
    get total() {
      return total;
    },
    /** 진행 중인가: 버튼 비활성화 조건 */
    get busy() {
      return total > 0;
    },
    /** 마지막 실행에서 실패가 있었다면 안내 문구, 없으면 null. */
    get error() {
      return error;
    },
    /** 순차 다운로드 실행. 진행 중이거나 대상이 없으면 아무것도 하지 않는다(중복 클릭 방어) */
    async run(items: readonly BulkDownloadItem[]): Promise<void> {
      if (total > 0 || items.length === 0) return;
      error = null;
      done = 0;
      total = items.length;
      let failed = 0;
      for (const item of items) {
        try {
          await downloadUrlAsFile(item.url, item.name);
        } catch {
          failed += 1;
        }
        done += 1;
      }
      total = 0;
      error = failed > 0 ? `${failed}개 파일을 받지 못했습니다.` : null;
    },
  };
}
