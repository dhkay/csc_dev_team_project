// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface Locals {
      accessToken: string | null;
      userId: number | null;
      // 요청 스코프 현재 유저 조회: 첫 호출 시 `/user-api/find/data`를 한 번만 실행하고
      // Promise를 메모이제이션한다. 토큰이 없으면 `null`.
      getUser: () => Promise<import('$lib/shared/types/common.types').CurrentUser | null>;
    }
  }
}

export {};
