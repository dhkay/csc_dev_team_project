// 개인 브랜드/컨셉 변경 레이어. 성공 시 내 브랜드/컨셉 invalidate.
//
// 저장이 둘이고 범위가 다르다. `setMyBrandConcept` 는 세트 목록 전체의 이름과 설명, 선택을
//   저장하고 카테고리 정의는 손대지 않는다. `setMyBrandConceptSet` 은 세트 하나의 연출(카테고리와
//   레퍼런스 정의 + 그중 무엇을 골랐는지)을 저장한다. 화면도 갈린다(설정 하단 바 / 카테고리 관리 모달)
//
// 선택은 양쪽에서 저장된다. 두 화면이 같은 값을 다루므로 나중에 저장한 쪽이 남는다.
import type { QueryClient } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type {
  BrandConceptSet,
  BrandConceptSetInput,
  ConceptChoice,
  CustomConceptAxis,
  CustomConceptOption,
} from '../types';
import * as api from '../apis/brandConceptApi';
import { brandConceptKeys } from '../queries/brandConcept.query';

export function setMyBrandConceptMutationOptions(queryClient: QueryClient, version: VersionMode) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (sets: BrandConceptSetInput[]): Promise<BrandConceptSet[]> => {
      const res = await api.setMyBrandConcept(version, sets);
      if (!res.success) throw new Error(res.error ?? '브랜드/컨셉을 저장하지 못했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brandConceptKeys.mine(version) });
    },
  };
}

/** 세트 하나의 연출(카테고리/레퍼런스 정의 + 선택) 교체 저장(카테고리 관리 모달의 저장) */
export function setMyBrandConceptSetMutationOptions(
  queryClient: QueryClient,
  version: VersionMode,
) {
  return {
    // 모달이 자체 에러 문구를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (input: {
      brandName: string;
      customAxes: CustomConceptAxis[];
      customOptions: CustomConceptOption[];
      concepts: ConceptChoice[];
    }): Promise<BrandConceptSet[]> => {
      const res = await api.setMyBrandConceptSet(version, input.brandName, {
        customAxes: input.customAxes,
        customOptions: input.customOptions,
        concepts: input.concepts,
      });
      if (!res.success) throw new Error(res.error ?? '카테고리를 저장하지 못했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brandConceptKeys.mine(version) });
    },
  };
}
