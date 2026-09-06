import type {} from 'axios';

/**
 * axios 요청 설정에 우리 관례 필드를 선언한다(module augmentation)
 * createApiClient 가 요청별 토큰을 `__authToken` 으로 실어 보내고,
 * authRequestInterceptor 가 이를 Authorization 헤더로 옮긴 뒤 제거한다.
 * 이 선언 덕분에 set/get/delete 모든 지점에서 any/unknown 캐스팅 없이 타입 안전하게 접근한다.
 * InternalAxiosRequestConfig 가 AxiosRequestConfig 를 상속하므로 인터셉터 쪽에도 함께 적용된다.
 */
declare module 'axios' {
  interface AxiosRequestConfig {
    // 요청별 액세스 토큰(SSR 전용 내부 필드)
    __authToken?: string;
  }
}
