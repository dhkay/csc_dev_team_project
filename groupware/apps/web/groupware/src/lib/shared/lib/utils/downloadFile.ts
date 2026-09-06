/**
 * 브라우저 파일 저장 유틸. 결과물이 다른 오리진(file-upload)에 있어서 필요한 우회다.
 *
 * `<a download href="https://files…">` 로는 안 된다. download 속성은 cross-origin URL 에서 무시되고,
 * 게다가 file-upload 는 video/mp4 를 `Content-Disposition: inline` 으로 서빙하므로(재생/시킹 지원 목적)
 * 브라우저가 저장 대신 재생을 시작한다. 그래서 blob 으로 받아 object URL 로 저장한다.
 *   - 가능한 이유: file-upload CORS(allowed_origins)에 web 오리진이 등록돼 있다.
 *   - 접근 URL 은 이미 서명돼 있으므로 쿠키가 필요 없다 → credentials 를 보내지 않는다.
 *     (서버가 allow_credentials 를 켜지 않아, 보내면 CORS 가 막는다)
 */

/** 확장자를 못 알아낼 때 쓴다. 이 유틸이 받는 것의 대부분이 렌더 결과 영상이라 mp4 로 둔다. */
const FALLBACK_EXTENSION = 'mp4';

/** MIME → 확장자. 여기 없는 종류는 위 폴백으로 떨어진다(종류가 늘면 한 줄 추가) */
const EXTENSION_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  // 최종 영상의 대표 썸네일(우리가 만든 PNG)과 그 밖의 그림
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** 파일명에 쓸 수 없는 문자 치환 + 길이 제한. 남는 게 없으면 'download' */
export function toSafeFileName(name: string, extension: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, ' ') // 윈도우/POSIX 금지 문자
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${cleaned || 'download'}.${extension}`;
}

/** blob 을 `baseName.<확장자>` 로 저장한다. object URL 수명 관리가 까다로워 한 곳에 모은다. */
function saveBlob(blob: Blob, baseName: string, extension: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = toSafeFileName(baseName, extension);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // 클릭 직후 해제하면 브라우저가 저장을 시작하기 전에 blob 이 사라질 수 있어 다음 태스크로 미룬다.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}

/**
 * URL 의 파일을 받아 `baseName.<확장자>` 로 저장한다. 확장자는 응답 MIME 에서 고른다.
 * (파일명을 호출부가 정하므로 스토리지의 내부 파일명이 아니라 목록의 제목을 그대로 쓸 수 있다)
 *
 * 실패는 throw 한다. 여러 건을 받을 때 호출부가 실패분만 골라 알릴 수 있게
 */
export async function downloadUrlAsFile(url: string, baseName: string): Promise<void> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
  const blob = await res.blob();
  const extension = EXTENSION_BY_MIME[blob.type.split(';')[0].trim()] ?? FALLBACK_EXTENSION;
  saveBlob(blob, baseName, extension);
}

/**
 * 브라우저에서 만든 텍스트를 파일로 저장한다(CSV 내보내기 등). 네트워크를 타지 않는다.
 *
 * 서버 라우트로 만들지 않는 이유: 내보낼 내용이 이미 화면이 받은 데이터라 서버를 한 번 더
 * 거치면 같은 조회를 두 번 하게 된다. 인코딩 힌트(BOM 등)는 문자열을 만드는 쪽이 담는다.
 */
export function downloadTextAsFile(
  text: string,
  baseName: string,
  extension: string,
  mimeType: string,
): void {
  saveBlob(new Blob([text], { type: mimeType }), baseName, extension);
}

/**
 * 브라우저에서 만든 blob 을 파일로 저장한다(캔버스로 합성한 썸네일 등). 네트워크를 타지 않는다.
 *
 * 확장자를 호출부가 정하는 이유: 만든 쪽이 무엇을 만들었는지 안다. MIME 에서 되짚으면 위의
 * EXTENSION_BY_MIME 를 만드는 종류마다 늘려야 하는데, 그 표는 받아 온 파일의 종류를 모를 때 쓰는 것이다.
 */
export function downloadBlobAsFile(blob: Blob, baseName: string, extension: string): void {
  saveBlob(blob, baseName, extension);
}
