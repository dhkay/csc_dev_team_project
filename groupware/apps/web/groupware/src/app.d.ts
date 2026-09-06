// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      accessToken: string | null;
      refreshToken: string | null;
      userId: number | null;
      // 요청 스코프 현재 유저 조회: 첫 호출 시 `/user-api/find/data`를 한 번만 실행하고
      // Promise를 메모이제이션한다. 같은 요청 내 Layout, Page, BFF 핸들러가 공유
      // 토큰이 없으면 `null`을 반환한다.
      getUser: () => Promise<import('$lib/shared/types/common.types').CurrentUser | null>;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
