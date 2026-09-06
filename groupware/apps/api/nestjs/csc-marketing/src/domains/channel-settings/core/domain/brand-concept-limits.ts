// 브랜드/컨셉 저장 상한 SSOT. DTO 검증과 서비스 정규화가 이 파일 하나를 참조
// 프론트에도 같은 상한이 복제돼 있어 함께 고쳐야 함(누락 시 scripts/check-brand-concept-limits.mjs 가 CI 에서 실패)
import { BRAND_CONCEPT_AXES } from './types';

// 브랜드명과 브랜드 설명 최대 길이
export const BRAND_CONCEPT_TEXT_MAX_LEN = 2000;

// 컨셉 축/옵션 key 최대 길이(opaque)
export const BRAND_CONCEPT_KEY_MAX_LEN = 64;

// 한 사람당 브랜드/컨셉 세트 최대 개수
export const BRAND_CONCEPT_MAX_SETS = 20;

// 세트당 커스텀 카테고리(축) 최대 개수
export const CUSTOM_AXES_MAX_PER_SET = 8;

// 한 축에 붙일 수 있는 커스텀 레퍼런스 최대 개수
export const CUSTOM_OPTIONS_MAX_PER_AXIS = 20;

// 세트당 커스텀 레퍼런스 총 최대 개수(축별 상한과 별개로 총량 제한)
export const CUSTOM_OPTIONS_MAX_PER_SET = 40;

// 커스텀 카테고리/레퍼런스 이름 최대 길이. 그대로 프롬프트로 나가 카탈로그 라벨 결에 맞춤
export const CUSTOM_LABEL_MAX_LEN = 60;

// 커스텀 레퍼런스 설명(감독 노트) 최대 길이
export const CUSTOM_DESCRIPTION_MAX_LEN = 200;

// 세트당 컨셉 선택 최대 개수. 축 수에서 파생해야 축 증가 시 정규화의 조용한 절단 방지
export const CONCEPT_MAX_PER_SET = BRAND_CONCEPT_AXES.length + CUSTOM_AXES_MAX_PER_SET;

// 저장 JSON 전체의 최대 바이트. 필드별 상한은 곱해지므로 총량은 직렬화 후 별도 측정
export const BRAND_CONCEPTS_JSON_MAX_BYTES = 256_000;
