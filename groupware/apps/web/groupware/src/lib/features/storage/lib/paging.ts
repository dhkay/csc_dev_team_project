// 목록 페이지 크기(순수): BFF 와 화면이 같은 값을 본다.
//
// 서버(file-upload)도 자기 상한을 갖는다(MAX_PAGE_SIZE). 두 값이 어긋나면 화면이 요청한 크기가
// 서버 스키마 검증에서 422 로 튕긴다. 그래서 상한을 여기 한 곳에 적고 양쪽이 이 값을 쓴다.

/** "더 보기" 한 번에 넓히는 개수 */
export const STORAGE_PAGE_STEP = 50;

/**
 * 한 번에 받아 올 수 있는 최대 개수
 *
 * 서버의 `MAX_PAGE_SIZE`(file-upload `core/application/storage_service.py`)와 같은 값이어야 한다.
 * 언어가 달라 한 상수를 공유할 수 없으므로, 서버 쪽에서 이 값을 올릴 때 여기도 함께 올린다.
 * 어긋나면 화면이 요청한 크기가 서버 스키마 검증에서 422 로 튕긴다.
 */
export const STORAGE_MAX_PAGE_SIZE = 200;

/** 요청 크기를 유효 범위로 자른다. 상한을 넘겨 보내면 서버가 거절한다. */
export function clampPageSize(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return STORAGE_PAGE_STEP;
  return Math.min(Math.floor(raw), STORAGE_MAX_PAGE_SIZE);
}
