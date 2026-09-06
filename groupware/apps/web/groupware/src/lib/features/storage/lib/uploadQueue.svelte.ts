// 업로드 큐(Svelte 5 runes, 모듈 싱글턴)
//
// 페이지 상태가 아니라 모듈 싱글턴인 이유: 올리는 도중 다른 영역으로 옮겨 다녀도 업로드가
// 끊기면 안 된다. 각 작업은 자기 목적지(영역/부서)를 들고 있다가 그곳에 올린다.
//
// 확인(confirm)은 업로드가 끝난 뒤 이 큐가 부른다. 실패하면 자산이 대기 상태로 남고 하루 뒤
// 수거자가 거둔다. 참조 없는 완료 자산을 만들지 않는 순서다(marketing-write-consistency.md 4.2)

import { UPLOAD_ABORTED, uploadBlob } from '$lib/infrastructure/http/upload';
import { storageService } from '../services/storage.service';
import { nextAvailableName } from './naming';
import type { StorageScope } from '../types';

type UploadJobStatus = 'waiting' | 'uploading' | 'done' | 'failed' | 'cancelled';

export interface UploadJob {
  id: string;
  fileName: string;
  size: number;
  loaded: number;
  status: UploadJobStatus;
  error?: string;
  scope: StorageScope;
}

/** 동시에 올리는 수. 브라우저 연결 수와 서버 부담 사이의 타협값이다. */
const CONCURRENCY = 3;

/** 아직 끝나지 않은 상태. 취소 버튼과 이탈 경고가 같은 기준을 본다. */
function isActive(job: UploadJob): boolean {
  return job.status === 'waiting' || job.status === 'uploading';
}

class UploadQueue {
  private _jobs = $state<UploadJob[]>([]);
  private pending: { job: UploadJob; file: File }[] = [];
  private running = 0;
  private sequence = 0;
  /** 업로드가 하나 끝났음을 알린다(화면이 목록과 사용량을 다시 읽는다) */
  private listeners = new Set<() => void>();
  /** 진행 중인 작업의 취소 신호와, 취소 시 버릴 대상(발급받은 업로드 id) */
  private controls = new Map<string, { abort: AbortController; uploadId?: string }>();

  get jobs(): UploadJob[] {
    return this._jobs;
  }

  get activeCount(): number {
    return this._jobs.filter(isActive).length;
  }

  onCompleted(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 올릴 파일을 줄에 세운다.
   *
   * takenNames 는 지금 그 영역에 이미 있는 이름이다. 겹치면 `보고서 (1).pdf` 로 비켜 간다.
   * 40개를 한꺼번에 떨어뜨리는 중에 이름을 묻는 것이 더 나쁘기 때문에 묻지 않고 비킨다.
   */
  enqueue(
    files: File[],
    scope: StorageScope,
    maxBytes: number,
    takenNames: readonly string[] = []
  ): void {
    const taken = new Set(takenNames.map((n) => n.toLowerCase()));
    for (const file of files) {
      this.sequence += 1;
      // 같은 드롭 안에서도 겹칠 수 있으므로 방금 정한 이름을 곧바로 집합에 넣는다.
      const fileName = nextAvailableName(file.name, taken);
      taken.add(fileName.toLowerCase());
      const job: UploadJob = {
        id: `job-${this.sequence}`,
        fileName,
        size: file.size,
        loaded: 0,
        status: 'waiting',
        scope
      };
      if (file.size > maxBytes) {
        // 상한을 넘는 파일은 왕복하지 않고 여기서 끝낸다. 서버도 같은 값으로 거절한다.
        this._jobs = [...this._jobs, { ...job, status: 'failed', error: '파일이 너무 큽니다.' }];
        continue;
      }
      this._jobs = [...this._jobs, job];
      this.pending.push({ job, file });
    }
    this.pump();
  }

  dismissFinished(): void {
    this._jobs = this._jobs.filter(isActive);
  }

  /**
   * 업로드 취소. 보내는 도중이라도 그 자리에서 끊는다.
   *
   * 끊은 뒤 서버에도 버리라고 알린다. 그 요청은 정리를 앞당길 뿐이라 실패해도 그냥 둔다.
   * 확정되지 않은 자산은 어차피 하루 뒤 수거자가 거두므로, 취소가 서버 응답을 기다릴 이유가 없다.
   * (반대로 취소를 서버 성공에 걸어 두면, 네트워크가 끊긴 상황에서 취소 자체가 안 된다.)
   */
  cancel(jobId: string): void {
    const job = this._jobs.find((j) => j.id === jobId);
    if (!job || !isActive(job)) return;
    const control = this.controls.get(jobId);
    this.controls.delete(jobId);
    // 아직 시작 전이면 줄에서 뺀다(시작한 뒤라면 abort 가 끊는다)
    this.pending = this.pending.filter((p) => p.job.id !== jobId);
    control?.abort.abort();
    this.patch(jobId, { status: 'cancelled' });
    if (control?.uploadId) {
      void storageService.discardUpload(job.scope, control.uploadId);
    }
    this.pump();
  }

  private pump(): void {
    while (this.running < CONCURRENCY && this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) return;
      this.running += 1;
      void this.run(next.job, next.file).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  private patch(id: string, patch: Partial<UploadJob>): void {
    this._jobs = this._jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  }

  private async run(job: UploadJob, file: File): Promise<void> {
    const control = { abort: new AbortController(), uploadId: undefined as string | undefined };
    this.controls.set(job.id, control);
    this.patch(job.id, { status: 'uploading' });
    try {
      const { uploadId } = await uploadBlob(
        storageService.presignRouteFor(job.scope),
        file,
        // 겹치는 이름을 비켜 간 값이라 파일 자체의 이름이 아니라 job 의 이름을 쓴다.
        job.fileName,
        file.type || 'application/octet-stream',
        {
          // 확인은 아래에서 스토리지 전용 경로로 한다(영역 검증이 함께 필요하다)
          confirm: false,
          onProgress: (loaded) => this.patch(job.id, { loaded }),
          signal: control.abort.signal,
          // 취소가 무엇을 버려야 하는지 알려면 이 값이 필요하다. 끊긴 업로드는 반환값이 없다.
          onPresigned: (id) => {
            control.uploadId = id;
          }
        }
      );
      const confirmed = await storageService.confirmUpload(job.scope, uploadId);
      if (!confirmed.success) {
        throw new Error(confirmed.error ?? '업로드 확인에 실패했습니다.');
      }
      this.patch(job.id, { status: 'done', loaded: file.size });
      for (const listener of this.listeners) listener();
    } catch (e) {
      const message = e instanceof Error ? e.message : '업로드에 실패했습니다.';
      // 취소로 끊긴 것은 실패가 아니다. 상태는 cancel() 이 이미 정했으므로 덮어쓰지 않는다.
      if (message !== UPLOAD_ABORTED) {
        this.patch(job.id, { status: 'failed', error: message });
      }
    } finally {
      this.controls.delete(job.id);
    }
  }
}

export const uploadQueue = new UploadQueue();

/** 스토리지 업로드 상한(200MB): 서버 storage_max_upload_size 와 같은 값이다. */
export const STORAGE_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
