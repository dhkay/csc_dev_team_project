// SvelteKit 앰비언트 타입
//
// App.Locals 가 비어 있는 것이 정상이다. 이 앱은 adapter-static SPA 라 서버 런타임이 없고,
// hooks.server.ts / +page.server.ts 를 쓰지 않는다. 기존 web 앱 2개(BFF)와 다른 지점
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
