// file-upload 업로드 시퀀스 SSOT: presign → 바이트 PUT → confirm.
//
// 이 3단계는 업로더(프로필 이미지, 기획안 씬 이미지, 이후 보관함 등)마다 똑같이 반복되므로 여기 한 곳에 둔다.
// 업로더마다 다른 건 presign BFF 라우트 하나뿐이다(그 라우트가 scope/partition 을 서버에서 주입한다)
// presign/confirm 은 같은 origin BFF(frontClient), 바이트 PUT 만 서명 토큰 때문에 BFF 우회 raw fetch(정상 패턴)
//
// 새 업로더 = presign 라우트 하나 추가 + 여기 uploadBlob(route, ...) 호출. 시퀀스는 복제하지 않는다.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PresignResult {
  uploadId: string;
  presignedUrl: string;
}

/** BFF 봉투 풀기: 실패면 서버 메시지로 throw. */
function unwrap<T>(body: Envelope<T>, fallback: string): T {
  if (!body.success || !body.data) throw new Error(body.error ?? fallback);
  return body.data;
}

/** presign: scope/partition 은 presignRoute 가 가리키는 BFF 가 주입한다(클라 비선택). 실패 시 throw. */
export async function presignUpload(
  presignRoute: string,
  fileName: string,
  mimeType: string,
  size: number,
): Promise<PresignResult> {
  const res = await frontClient().POST<Envelope<PresignResult>>(presignRoute, {
    fileName,
    mimeType,
    size,
  });
  return unwrap(res.data, '업로드 준비에 실패했습니다.');
}

/** 업로드 진행률 콜백: 보낸 바이트와 전체 바이트 */
export type UploadProgress = (loaded: number, total: number) => void;

/**
 * 바이트 직접 PUT: presigned 절대 URL(서명 토큰 포함). File 은 Blob 이라 그대로 받는다. 실패 시 throw.
 *
 * onProgress 를 주면 XHR 로 보낸다. fetch 에는 업로드 진행률 이벤트가 없기 때문이고, 큰 파일을
 * 올리는 화면에서 진행률이 없으면 사용자는 멈춘 것과 구분하지 못한다. 콜백이 없으면 기존
 * fetch 경로를 그대로 쓴다(기존 호출부의 동작이 한 글자도 바뀌지 않는다)
 */
/** 업로드 취소 신호로 끊겼을 때 던지는 오류. 호출부가 실패와 취소를 구분한다. */
export const UPLOAD_ABORTED = '업로드가 취소되었습니다.';

export async function putBytes(
  presignedUrl: string,
  body: Blob,
  mimeType: string,
  onProgress?: UploadProgress,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error(UPLOAD_ABORTED);
  if (!onProgress) {
    const res = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body,
      signal,
    });
    if (!res.ok) throw new Error('파일 업로드에 실패했습니다.');
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // 취소는 보내는 도중에 끊을 수 있어야 한다. 200MB 를 다 올린 뒤 버리는 것은 취소가 아니다.
    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const done = (settle: () => void) => {
      signal?.removeEventListener('abort', abort);
      settle();
    };
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () =>
      done(() =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('파일 업로드에 실패했습니다.')),
      );
    xhr.onerror = () => done(() => reject(new Error('파일 업로드에 실패했습니다.')));
    xhr.onabort = () => done(() => reject(new Error(UPLOAD_ABORTED)));
    xhr.send(body);
  });
}

/** confirm: PENDING → UPLOADED 확정. 실패 시 throw. (접근 URL 은 저장하지 않고 렌더 시 서명 발급한다.) */
export async function confirmUpload(uploadId: string): Promise<void> {
  const res = await frontClient().POST<Envelope<unknown>>(ROUTES.FILE_UPLOAD.CONFIRM, {
    uploadId,
  });
  if (!res.data.success) throw new Error(res.data.error ?? '업로드 확인에 실패했습니다.');
}

/** 업로드 결과: uploadId(영구 참조, 저장 대상). 접근 URL 은 렌더 시 서명 발급하므로 여기서 반환하지 않는다. */
export interface UploadResult {
  uploadId: string;
}

/**
 * 전체 시퀀스: presign → PUT → confirm. 업로더는 presign 라우트와 바이트만 정하면 된다.
 *
 * mimeType 은 호출자가 명시한다(blob.type 을 여기서 추론하지 않는다). 실효 MIME 은 업로더마다
 * 판정 규칙이 다르기 때문: 예: 프로필 이미지는 일부 OS 가 .svg 의 file.type 을 빈/비표준으로 보고해
 * 확장자로 보정한다($lib/shared/lib/image/imageFile.resolveMime). 추론을 여기 숨기면 그 보정이 조용히 무시된다.
 */
export interface UploadBlobOptions {
  // 업로드 확인(PENDING → UPLOADED)을 브라우저가 할지. 기본 true.
  //
  // false 로 두면 확인을 소비 서버가 한다. 그 자산을 참조할 행을 만드는 쪽이 확인까지 함께
  // 처리하면, 그 쓰기가 실패했을 때 자산이 PENDING 으로 남아 수거 대상이 된다. 브라우저가 미리
  // 확인해 버리면 참조 없는 UPLOADED 가 남고, 그건 아무도 거두지 못한다(참조 여부를 file-upload 가
  // 알 수 없어서다). 계약과 근거: docs/specs/marketing-write-consistency.md
  confirm?: boolean;
  // 진행률 콜백. 주면 바이트 PUT 이 XHR 로 바뀐다(fetch 에는 업로드 진행 이벤트가 없다)
  onProgress?: UploadProgress;
  // 취소 신호. 보내는 도중이라도 끊는다.
  //
  // 신호를 끊는 주체는 그 업로드를 화면에서 없앤 액션이다.
  // (docs/specs/marketing-write-consistency.md 4.1 의 취소 신호 경로 규칙)
  signal?: AbortSignal;
  // 업로드 주소를 받은 직후 호출된다.
  //
  // 취소한 호출부가 무엇을 버려야 하는지 알려면 uploadId 가 필요한데, 그 값은 시퀀스가
  // 끝나야 반환된다. 중간에 끊긴 업로드는 반환값이 없으므로 여기서 미리 건넨다.
  onPresigned?: (uploadId: string) => void;
}

export async function uploadBlob(
  presignRoute: string,
  blob: Blob,
  fileName: string,
  mimeType: string,
  options: UploadBlobOptions = {},
): Promise<UploadResult> {
  const { uploadId, presignedUrl } = await presignUpload(presignRoute, fileName, mimeType, blob.size);
  options.onPresigned?.(uploadId);
  await putBytes(presignedUrl, blob, mimeType, options.onProgress, options.signal);
  if (options.confirm ?? true) await confirmUpload(uploadId);
  return { uploadId };
}
