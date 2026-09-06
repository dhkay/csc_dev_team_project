/**
 * FocusKeywordGeneratorPort 구현: language-model 에 후보 생성을 맡기고 문자열 배열로 파싱한다.
 *
 * 프롬프트는 조립된 채로 온다(그 버전의 조립기가 만든다). 이 계층이 하는 일은 전송과 파싱뿐이다.
 *
 * 전송 노브를 여기 두는 이유: 후보는 짧은 검색어라 출력이 작고(개당 10~20 토큰 수준) 그 사실은
 * 버전과 무관하다. `temperature` 를 높인 이유는 같은 씨앗으로 다시 눌렀을 때 같은 목록만 나오면
 * '생성' 이 의미가 없어서다(기획 생성과 성격이 반대다: 그쪽은 결과가 결과물이라 흔들림을 줄인다)
 */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LanguageModelApiClientService } from '../../../../../shared/adapters/outbound/language-model-api';
import { FOCUS_KEYWORD_MAX_LENGTH } from '../../../core/domain';
import {
  FocusKeywordGeneratorPort,
  FocusKeywordContext,
} from '../../../core/application/ports/outbound';
import { callTextGenerate } from '../text-generate-call';

/** 후보 하나가 짧아 예산도 작다. 요청 개수를 곱하지 않는 이유: 15개도 이 안에 넉넉히 든다. */
const MAX_TOKENS = 400;

/** 같은 입력에 다른 목록이 나와야 '생성' 이 뜻을 갖는다. 기획 생성보다 높다. */
const TEMPERATURE = 1;

@Injectable()
export class LanguageModelFocusKeywordGeneratorAdapter implements FocusKeywordGeneratorPort {
  constructor(private readonly client: LanguageModelApiClientService) {}

  async suggest(context: FocusKeywordContext): Promise<string[]> {
    const res = await callTextGenerate(this.client, {
      organizationId: context.organizationId,
      model: context.model,
      systemPrompt: context.systemPrompt,
      userPrompt: context.userPrompt,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    });
    return parseKeywords(res?.text ?? '', context.needed);
  }
}

/**
 * 모델 출력 → 후보 목록. JSON 배열이 정상 경로이고, 코드펜스나 앞뒤 설명이 붙은 경우도 건져 낸다.
 * 트림/빈값 제거/길이 컷/중복 제거 후 요청 개수까지만 남긴다. 하나도 못 건지면 500(빈 목록을
 * 성공으로 돌려주면 화면이 "후보가 없다"와 "모델이 헛소리를 했다"를 구분하지 못한다)
 */
function parseKeywords(text: string, limit: number): string[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  let parsed: unknown = null;
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }
  const raw = Array.isArray(parsed) ? parsed : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const value = item.trim().slice(0, FOCUS_KEYWORD_MAX_LENGTH);
    if (value.length > 0 && !out.includes(value)) out.push(value);
    if (out.length >= limit) break;
  }
  if (out.length === 0) {
    throw new InternalServerErrorException('키워드 후보를 만들지 못했습니다. 다시 시도해 주세요.');
  }
  return out;
}
