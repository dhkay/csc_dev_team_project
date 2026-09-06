// 브랜드/컨셉 세트의 카테고리 편집 규칙. 컴포넌트가 아니라 여기가 이 기능의 로직이다.
//
// 이 편집은 순수 변환이라 모듈로 뺀다. 컴포넌트 안에 두면 테스트가 닿지 않고, 특히 `sameSets` 는
// 조용히 실패하는 지점이다. 비교키에 커스텀 정의가 빠지면 카테고리만 바꿨을 때 dirty 가 되지 않아
// 저장 버튼이 비활성으로 남는데 화면은 편집된 상태를 보여준다.
//
// 백엔드 정규화와 같은 규칙을 여기서도 적용해 서버가 조용히 버릴 값을 화면이 먼저 막는다.
// 최종 권한은 서버에 있다.

import type {
  BrandConceptAxis,
  BrandConceptOption,
  BrandConceptSetInput,
  ConceptAxisRef,
  CustomConceptKey,
  CustomConceptOption,
} from '../types';

// 상한: 백엔드 `channel-settings/core/domain/brand-concept-limits.ts` 가 SSOT 이고 여기는 그 복제다.
//   공유 패키지가 없어(이 도구에는 `@csc/entitlements` 같은 커널이 없다) 복제할 수밖에 없고,
//   어긋나면 조용히 망가진다. 여기가 더 크면 화면은 입력을 받고 저장 성공을 보여주는데 서버가
//   그 값을 잘라 "저장했는데 사라진다". 여기가 더 작으면 서버가 받아 줄 값을 이유 없이 막는다.
//   그래서 `scripts/check-brand-concept-limits.mjs` 가 두 파일의 숫자를 비교해 CI 에서 세운다.
//   (이름을 바꾸면 짝을 찾지 못해 그것도 실패한다: 게이트가 헛도는 것을 막는다)
export const CUSTOM_AXES_MAX_PER_SET = 8;
export const CUSTOM_OPTIONS_MAX_PER_AXIS = 20;
export const CUSTOM_OPTIONS_MAX_PER_SET = 40;
export const CUSTOM_LABEL_MAX_LEN = 60;
export const CUSTOM_DESCRIPTION_MAX_LEN = 200;

/**
 * 카드가 그릴 축 하나: 기본 축과 커스텀 축을 같은 모양으로 만든 것
 *
 * `custom` 은 관리 모달에서만 쓴다(수정/삭제를 그 항목에만 보인다). 카드에서는 고르는 행위가
 * 둘이 같으므로 구분하지 않는다.
 */
export interface DisplayAxis {
  key: ConceptAxisRef;
  label: string;
  description: string;
  options: DisplayOption[];
  // 이 카테고리가 세트가 더한 것인가. 기본 제공은 false(수정도 삭제도 불가)
  custom: boolean;
}

/** 카드가 그릴 선택지 하나. `custom` 인 것만 수정/삭제할 수 있다. */
interface DisplayOption extends BrandConceptOption {
  custom: boolean;
}

/**
 * 새 커스텀 key: `x:` + 8 hex.
 *
 * 서버가 받는 형식(`CUSTOM_CONCEPT_KEY_PATTERN`)과 맞아야 한다. 어긋나면 서버가 그 정의를 조용히
 * 버려 화면은 저장 성공을 보여주고 카테고리는 사라진다. 그래서 형식을 단위 테스트가 잡아 둔다.
 *
 * uuid 를 쓰지 않는 이유는 길이다. `ConceptChoiceDto.axis` 가 32자 제한인데 uuid 는 36자다.
 */
export function newCustomKey(): CustomConceptKey {
  const n = Math.floor(Math.random() * 0xffffffff);
  return `x:${n.toString(16).padStart(8, '0')}`;
}

/** 이름 정규화: 개행과 연속 공백을 한 칸으로 접고 길이를 자른다(백엔드와 같은 규칙) */
function normalizeLabel(value: string, max = CUSTOM_LABEL_MAX_LEN): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * 기본 축 + 커스텀 축을 카드가 그릴 한 목록으로
 *
 * 순서: 기본 축(카탈로그 순서) → 커스텀 축(추가 순서). 프롬프트의 축 순서와 같다.
 * 기본 축에 더한 레퍼런스는 그 축의 옵션 뒤에 붙는다(같은 줄에 섞여 보이는 것이 목업의 형태다)
 */
export function mergeAxes(
  catalog: BrandConceptAxis[],
  set: Pick<BrandConceptSetInput, 'customAxes' | 'customOptions'> | null | undefined,
): DisplayAxis[] {
  const customAxes = set?.customAxes ?? [];
  const customOptions = set?.customOptions ?? [];
  const optionsOf = (axis: ConceptAxisRef): DisplayOption[] =>
    customOptions
      .filter((o) => o.axis === axis)
      .map((o) => ({ key: o.key, label: o.label, description: o.description, custom: true }));

  return [
    ...catalog.map((a) => ({
      key: a.key,
      label: a.label,
      description: a.description,
      options: [...a.options.map((o) => ({ ...o, custom: false })), ...optionsOf(a.key)],
      custom: false,
    })),
    ...customAxes.map((a) => ({
      key: a.key,
      label: a.label,
      // 커스텀 축에는 설명이 없다. 미선택 안내 자리를 비워 두면 기본 축과 높이가 어긋나 보인다.
      description: '내가 추가한 카테고리입니다.',
      options: optionsOf(a.key),
      custom: true,
    })),
  ];
}

/**
 * 이 이름을 그 축에 쓸 수 있는가. 쓸 수 없으면 이유를, 쓸 수 있으면 null.
 *
 * 카테고리 이름과 레퍼런스 이름을 같은 함수로 판정하지 않는다. 겹치면 안 되는 상대가 다르다.
 * 카테고리는 기본 카테고리 이름과, 레퍼런스는 그 축의 선택지 이름과 겹치면 안 된다.
 */
export function validateAxisLabel(
  catalog: BrandConceptAxis[],
  set: Pick<BrandConceptSetInput, 'customAxes'> | null | undefined,
  label: string,
  // 수정 중인 카테고리의 key. 자기 자신과의 중복은 중복이 아니다.
  editingKey?: string,
): string | null {
  const name = normalizeLabel(label);
  if (name.length === 0) return '이름을 입력해 주세요.';
  if (catalog.some((a) => a.label === name)) {
    // 겹치면 기획서 프롬프트에 그 축의 줄이 둘 실려 모델이 상반된 지시를 받는다.
    return '기본 카테고리와 같은 이름은 쓸 수 없습니다.';
  }
  const dup = (set?.customAxes ?? []).some((a) => a.label === name && a.key !== editingKey);
  return dup ? '이미 있는 카테고리 이름입니다.' : null;
}

/** 이 이름을 그 축의 레퍼런스로 쓸 수 있는가. 쓸 수 없으면 이유를, 쓸 수 있으면 null. */
export function validateOptionLabel(
  axes: DisplayAxis[],
  axis: ConceptAxisRef,
  label: string,
  // 수정 중인 레퍼런스의 key. 자기 자신과의 중복은 중복이 아니다.
  editingKey?: string,
): string | null {
  const name = normalizeLabel(label);
  if (name.length === 0) return '이름을 입력해 주세요.';
  const target = axes.find((a) => a.key === axis);
  const dup = (target?.options ?? []).some((o) => o.label === name && o.key !== editingKey);
  // 한 카테고리에 같은 이름 칩이 둘이면 어느 것을 고른 것인지 구별할 수 없다.
  return dup ? '이 카테고리에 이미 있는 이름입니다.' : null;
}

/** 카테고리 추가. 상한을 넘으면 세트를 그대로 돌려준다(호출부가 미리 막지만 여기서도 지킨다) */
export function addCustomAxis(
  set: BrandConceptSetInput,
  label: string,
  key: CustomConceptKey = newCustomKey(),
): BrandConceptSetInput {
  const axes = set.customAxes ?? [];
  if (axes.length >= CUSTOM_AXES_MAX_PER_SET) return set;
  return { ...set, customAxes: [...axes, { key, label: normalizeLabel(label) }] };
}

/** 카테고리 이름 변경. key 는 그대로라 이미 고른 선택이 살아남는다. */
export function renameCustomAxis(
  set: BrandConceptSetInput,
  key: string,
  label: string,
): BrandConceptSetInput {
  return {
    ...set,
    customAxes: (set.customAxes ?? []).map((a) =>
      a.key === key ? { ...a, label: normalizeLabel(label) } : a,
    ),
  };
}

/**
 * 카테고리 삭제. 그 축의 레퍼런스와 그 축의 선택을 함께 지운다.
 *
 * 셋을 함께 지우지 않으면 어떤 화면에도 나타나지 않는 값이 저장분에 남고, 선택만 남으면 서버 검증이
 * 그 세트를 거절해 편집 전체가 저장되지 않는다.
 */
export function removeCustomAxis(set: BrandConceptSetInput, key: string): BrandConceptSetInput {
  return {
    ...set,
    customAxes: (set.customAxes ?? []).filter((a) => a.key !== key),
    customOptions: (set.customOptions ?? []).filter((o) => o.axis !== key),
    concepts: set.concepts.filter((c) => c.axis !== key),
  };
}

/** 레퍼런스 추가. 축당/세트당 상한을 넘으면 세트를 그대로 돌려준다. */
export function addCustomOption(
  set: BrandConceptSetInput,
  axis: ConceptAxisRef,
  label: string,
  description: string,
  key: CustomConceptKey = newCustomKey(),
): BrandConceptSetInput {
  const options = set.customOptions ?? [];
  if (options.length >= CUSTOM_OPTIONS_MAX_PER_SET) return set;
  if (options.filter((o) => o.axis === axis).length >= CUSTOM_OPTIONS_MAX_PER_AXIS) return set;
  const added: CustomConceptOption = {
    axis,
    key,
    label: normalizeLabel(label),
    description: normalizeLabel(description, CUSTOM_DESCRIPTION_MAX_LEN),
  };
  return { ...set, customOptions: [...options, added] };
}

/** 레퍼런스 이름/설명 변경. key 는 그대로라 이미 고른 선택이 살아남는다. */
export function updateCustomOption(
  set: BrandConceptSetInput,
  key: string,
  patch: { label?: string; description?: string },
): BrandConceptSetInput {
  return {
    ...set,
    customOptions: (set.customOptions ?? []).map((o) =>
      o.key === key
        ? {
            ...o,
            ...(patch.label !== undefined ? { label: normalizeLabel(patch.label) } : {}),
            ...(patch.description !== undefined
              ? { description: normalizeLabel(patch.description, CUSTOM_DESCRIPTION_MAX_LEN) }
              : {}),
          }
        : o,
    ),
  };
}

/** 레퍼런스 삭제. 그 레퍼런스를 가리키는 선택도 함께 지운다(위 카테고리 삭제와 같은 이유) */
export function removeCustomOption(set: BrandConceptSetInput, key: string): BrandConceptSetInput {
  return {
    ...set,
    customOptions: (set.customOptions ?? []).filter((o) => o.key !== key),
    concepts: set.concepts.filter((c) => c.option !== key),
  };
}

/**
 * 세트 하나의 비교키. 스테이징 dirty 판정에 쓴다.
 *
 * 커스텀 정의는 넣지 않는다. 이 판정이 답하는 질문은 설정 화면 하단 바에 저장할 것이 있는가이고,
 * 카테고리와 레퍼런스의 정의는 관리 모달이 자기 요청으로 이미 저장했다. 넣으면 하단 바가 자기
 * 것이 아닌 변경을 두고 저장하지 않은 변경이 있다고 말한다.
 *
 * 선택은 순서 무관이라 정렬해 비교한다.
 */
function setKey(set: BrandConceptSetInput): string {
  // 문자열을 이어 붙이지 않고 JSON 으로 만든다. 브랜드명과 설명은 자유 입력이라 어떤 구분자든 그
  //   안에 들어올 수 있고, 들어오면 서로 다른 두 세트의 키가 같아져 dirty 를 놓친다. 그것이 이
  //   함수가 막으려는 실패 자체다.
  return JSON.stringify([
    set.brandName,
    set.brandDescription,
    set.concepts.map((c) => [c.axis, c.option]).sort(),
  ]);
}

/** 두 세트 목록이 같은가(설정 화면 하단 바의 dirty 판정) */
export function sameSets(a: BrandConceptSetInput[], b: BrandConceptSetInput[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => setKey(s) === setKey(b[i]));
}

/**
 * 세트 하나의 연출 비교키. 카테고리 관리 모달의 dirty 판정에 쓴다.
 *
 * `setKey` 와 담는 것이 다르다. 그쪽은 하단 바가 저장하는 것(브랜드명, 설명, 선택)을, 이쪽은 모달이
 * 저장하는 것(카테고리와 레퍼런스 정의, 그리고 선택)을 담는다. 선택은 두 화면이 함께 다루므로 양쪽
 * 키에 들어간다. 저장 버튼이 둘이라 "저장할 것이 있는가" 도 각자 재야 한다.
 *
 * 정의는 순서까지 본다(추가 순서가 곧 칩 순서라 사용자에게 보이는 차이다). 선택은 순서 무관이다.
 */
export function setDetailKey(
  set: Pick<BrandConceptSetInput, 'customAxes' | 'customOptions' | 'concepts'> | null | undefined,
): string {
  return JSON.stringify([
    (set?.customAxes ?? []).map((a) => [a.key, a.label]),
    (set?.customOptions ?? []).map((o) => [o.axis, o.key, o.label, o.description]),
    (set?.concepts ?? []).map((c) => [c.axis, c.option]).sort(),
  ]);
}
