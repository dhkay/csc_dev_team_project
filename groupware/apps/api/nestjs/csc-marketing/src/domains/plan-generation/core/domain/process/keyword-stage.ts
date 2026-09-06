/**
 * '키워드 준비' 단계. 두 버전이 공유하는 유일한 단계
 * 이 단계가 서술하는 흐름이 실제로 한 벌의 구현이고 버전으로 갈리지 않아 산문도 한 벌
 * 단 머릿글은 인자로 받음(입력 방식이 둘인 버전에는 이 단계를 밟지 않는 경로가 있음)
 */
import {
  FOCUS_KEYWORD_MAX,
  FOCUS_KEYWORD_MAX_ATTEMPTS,
  FOCUS_KEYWORD_SUGGESTION_COUNT,
  FOCUS_KEYWORD_VIEW_CONTEXT,
} from '../focus-keyword-prompt';
import type { PromptSegmentCatalog } from '../prompt-catalog';
import { toNodes } from './segment-nodes';
import type { ProcessStage, PromptPhase } from './types';

export function buildKeywordStage(
  segments: PromptSegmentCatalog,
  subtitle: string,
): ProcessStage {
  const focusKeywordPhase: PromptPhase = {
    id: 'focus-keyword',
    title: '키워드 보완 프롬프트',
    subtitle:
      '수집만으로 후보가 모자랄 때, 모자란 개수만큼만 더 만들게 하는 프롬프트. 이미 수집된 후보를 함께 보내 같은 말이 두 번 나오지 않게 합니다.',
    nodes: toNodes(segments.focusKeyword, FOCUS_KEYWORD_VIEW_CONTEXT),
  };

  return {
    id: 'keyword',
    title: '키워드 준비',
    subtitle,
    steps: [
      {
        id: 'collect-keyword-pool',
        title: '데이터 수집',
        subtitle: '검색어를 직접 주는 소스에서 실제 검색어를 모은다.',
        execution: 'parallel',
        usesPrompt: false,
        prompts: [],
        note: '조직이 켠 키워드 원천 소스를 병렬로 수집합니다(연관 검색어, 분야 인기 검색어, 지역 인기 검색어, 실시간 검색어). 수집 서버는 첫 조회에 "수집 중"을 주고 뒤에서 모으므로 결과가 확정될 때까지 기다립니다. 상한을 넘거나 실패한 소스는 그것만 빠지고 나머지로 진행합니다(한 소스 때문에 전체가 막히지 않습니다). 자연어 프롬프트를 쓰는 스텝은 아닙니다.',
      },
      {
        id: 'filter-keyword-pool',
        title: '후보 선별',
        subtitle: '입력 키워드를 품은 롱테일만 남긴다.',
        execution: 'sequential',
        usesPrompt: false,
        prompts: [],
        note: '후보는 "입력 키워드 + 단어" 형태여야 합니다. 입력한 말을 그대로 품고 그보다 긴 검색어만 남기고(띄어쓰기는 무시합니다), 중복을 지우고, 검색량이 많은 순으로 정렬합니다. 인기 검색어 소스는 그 시각에 많이 검색된 말을 주므로 대부분 여기서 걸러집니다. 규칙 판정이라 프롬프트가 없습니다.',
      },
      {
        id: 'supplement-keyword',
        title: '키워드 보완 (LLM)',
        subtitle: '수집만으로 모자란 개수를 채운다.',
        execution: 'sequential',
        usesPrompt: true,
        prompts: [focusKeywordPhase],
        injection: {
          summary: `LLM 생성 최대 ${FOCUS_KEYWORD_MAX_ATTEMPTS}회 (수집이 목표 개수를 채우면 호출하지 않음)`,
          target: 'LLM 생성 호출 (POST /inference/generate): 채널이 고른 LLM 모델',
          cardinality: `검색 1회당 최대 ${FOCUS_KEYWORD_MAX_ATTEMPTS}회. 목표 ${FOCUS_KEYWORD_SUGGESTION_COUNT}개에서 그때까지 모인 수를 뺀 만큼만 요청하며, 모자라면 남은 만큼 다시 부른다. 한 바퀴 돌아 하나도 늘지 않으면 더 부르지 않는다.`,
          timing: '후보 선별이 끝난 직후. 수집 후보가 목표 개수에 이르면 이 호출 자체를 건너뛴다.',
          assembly: 'system 필드(키워드 규칙)와 user 메시지(주제, 채널, 이미 있는 후보, 필요 개수)를 한 요청에 함께 담아 보낸다.',
          output: '입력 키워드를 품은 더 긴 검색어를, 이미 있는 후보와 겹치지 않게 JSON 문자열 배열로 출력한다. 이 결과에는 "생성" 라벨이 붙어 수집값과 구분된다.',
          condition: '수집 후보가 목표 개수보다 적을 때만 나간다. 보완이 실패해도 수집 후보가 있으면 그것만으로 진행한다.',
        },
        note: '보완분도 수집분과 같은 잣대로 거릅니다. 입력 키워드를 품지 않은 값은 프롬프트로 요구했더라도 목록에 넣지 않으며, 버린 만큼은 다음 회차가 채웁니다. 수집값과 생성값은 라벨로 구분해 화면에 보여줍니다. 작업자가 실측과 추정을 같은 무게로 고르지 않게 하기 위해서입니다.',
      },
      {
        id: 'select-keyword',
        title: '작업자 선택',
        subtitle: '후보 중 기획에 쓸 키워드를 고른다.',
        execution: 'sequential',
        usesPrompt: false,
        prompts: [],
        note: `사람이 최대 ${FOCUS_KEYWORD_MAX}개를 고릅니다. 고른 키워드만 기획서 생성으로 넘어가고, 수집 원문은 여기서 버려집니다. 저장하지 않으므로 기획서 생성을 다시 열면 처음부터 다시 고릅니다.`,
      },
    ],
  };
}
