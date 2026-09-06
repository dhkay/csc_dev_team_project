/**
 * 과금 단위: 벤더가 실제로 무엇을 세는가
 *
 * 값은 로그 레코드(payload.cost.units)에 그대로 저장/전송되므로 바꾸면 과거 기록이 깨진다.
 * 새 단위 추가는 안전하지만 기존 값의 문자열 변경은 마이그레이션이다.
 */
export enum BillingUnit {
  /** 텍스트 입력 토큰(LLM 프롬프트, 이미지 모델의 텍스트 프롬프트) */
  TextInputToken = 'text-input-token',
  /** 텍스트 출력 토큰(LLM 생성 결과) */
  TextOutputToken = 'text-output-token',
  /**
   * 이미지 입력 토큰. 텍스트 입력과 단가가 다르다(gpt-image: $8 vs $5 / 1M)
   * 합계만 남기면 되계산이 불가능해서 따로 센다.
   */
  ImageInputToken = 'image-input-token',
  /** 이미지 출력 토큰(gpt-image 는 장당 정액이 아니라 토큰 과금이다) */
  ImageOutputToken = 'image-output-token',
  /**
   * 출력 영상 길이(초, 정수). 해상도와 무관하게 이 값에만 비례한다.
   * 벤더에 보낸 정수초를 쓴다. 합성 결과물을 측정한 길이가 아니다(나레이션에 맞춰 늘린 값이라 다르다)
   */
  OutputVideoSecond = 'output-video-second',
  /** 영상 생성에 넣은 입력 이미지 장수 */
  InputImageCount = 'input-image-count',

  // 프롬프트 캐싱을 도입하면 캐시 쓰기(정가의 1.25배)/읽기(0.1배) 단위를 여기에 추가해야 한다.
  // 지금은 anthropic 어댑터가 cache_control 을 보내지 않아 벤더 응답에 캐시 필드가 아예 없다.
  // 단위를 추가하지 않은 채 캐싱을 켜면 캐시 읽기가 정가 입력으로 계산돼 10배 과다 청구된다.
}
