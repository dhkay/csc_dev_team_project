// 마케팅 채널 API 결과 봉투 + 공용 실행 헬퍼: 앱 공용 단일 출처($lib/infrastructure/http/apiResult) 재노출
// (기존 import 경로 './result' 호환 유지. 본문 중복은 제거됨.)
export { run, type ApiResult } from '$lib/infrastructure/http/apiResult';
