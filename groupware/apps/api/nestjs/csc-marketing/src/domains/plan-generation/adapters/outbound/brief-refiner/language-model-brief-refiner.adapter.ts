/**
 * BriefRefinerPort 구현: language-model 에 입력 정제를 맡기고 JSON 객체를 도메인 구조로 읽는다.
 *
 * 프롬프트는 조립된 채로 온다(그 버전의 조립기가 만든다). 이 계층이 하는 일은 전송과 파싱뿐이다.
 */
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { LanguageModelApiClientService } from '../../../../../shared/adapters/outbound/language-model-api';
import { RefinedBrief, RefinedSegment } from '../../../core/domain';
import {
  BriefRefinementContext,
  BriefRefinementResult,
  BriefRefinerPort,
} from '../../../core/application/ports/outbound';
import { callTextGenerate, toUsage } from '../text-generate-call';

// 출력 상한을 이 서버가 정하지 않는다. 정제본의 길이는 원문이 정하고 원문 길이에는 제한이 없으므로,
// 여기서 수를 정하면 그것이 곧 정제본의 글자수 제한이 된다(긴 브리프가 잘려 파싱에 실패한다).
// 창보다 큰 값을 보내면 language-model 이 그 모델의 창으로 깎아(output_budget) 창 전체를 받는다.
// 청구는 실제 생성된 토큰에만 붙어 넓게 잡아 잃는 것이 없다.
export const REQUEST_FULL_WINDOW_TOKENS = 1_000_000;

// 전송 계층이 요구하는 값. 고정 모델(Claude)에는 language-model 이 temperature 를 보내지 않으므로
// 지금은 효과가 없고, 내장 모델로 바뀌는 날 변환 작업에 맞는 낮은 값이 서게 둔다.
const TEMPERATURE = 0.2;

@Injectable()
export class LanguageModelBriefRefinerAdapter implements BriefRefinerPort {
  private readonly logger = new Logger(LanguageModelBriefRefinerAdapter.name);

  constructor(private readonly client: LanguageModelApiClientService) {}

  async refine(context: BriefRefinementContext): Promise<BriefRefinementResult> {
    const res = await callTextGenerate(this.client, {
      organizationId: context.organizationId,
      model: context.model,
      systemPrompt: context.systemPrompt,
      userPrompt: context.userPrompt,
      maxTokens: REQUEST_FULL_WINDOW_TOKENS,
      temperature: TEMPERATURE,
    });
    return { refined: this.parse(res?.text ?? ''), usage: toUsage(res, context.model) };
  }

  /**
   * 모델 출력 → 정제 결과. JSON 객체가 정상 경로이고, 코드펜스나 앞뒤 설명이 붙은 경우도 건져 낸다.
   * 읽지 못하면 500. 빈 결과를 성공으로 돌려주면 서비스가 "적은 것이 없다" 와 "모델이 헛소리를 했다" 를
   * 구분하지 못하고, 그 상태로 기획 LLM 이 원문 없는 프롬프트를 받는다.
   */
  private parse(text: string): RefinedBrief {
    const parsed = parseJsonObject(text);
    if (!parsed) {
      // 읽지 못한 텍스트를 남긴다. 없으면 모델이 무엇을 돌려줬는지 알 방법이 없어 진단이 막힌다.
      this.logger.error(
        `입력 정제 결과 파싱 실패: 길이=${text.length}` +
          ` 앞=${JSON.stringify(text.slice(0, 200))} 뒤=${JSON.stringify(text.slice(-120))}`,
      );
      throw new InternalServerErrorException('입력을 정제하지 못했습니다. 다시 시도해 주세요.');
    }
    // 동영상 수 상한은 여기서 자르지 않는다. 자르면 작업자가 나눈 단위가 말없이 바뀐다.
    //   초과는 원문을 아는 서비스가 거절하고 화면이 그 사유를 알린다.
    return {
      segments: toSegments(parsed.segments),
      constraints: toLines(parsed.constraints),
      notes: toLines(parsed.notes),
    };
  }
}

/**
 * 코드펜스와 서두/꼬리 설명을 벗기고 첫 '{' 부터 마지막 '}' 까지를 객체로 읽는다. 실패하면 null
 * 스키마의 두 키(segments, constraints)가 하나도 없으면 읽은 것으로 치지 않는다. 배열 응답의 안쪽
 * 객체나 무관한 JSON 이 여기 걸리는데, 그것을 "동영상도 제한도 없는 정제본" 으로 돌려주면 비어 있는
 * 것과 못 읽은 것이 구분되지 않는다.
 */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    return Array.isArray(o.segments) || 'constraints' in o ? o : null;
  } catch {
    return null;
  }
}

/**
 * 응답 segments → 도메인 세그먼트. 장면 구성도 말도 없는 항목은 버린다(만들 것이 없는 동영상).
 * 둘 다 오면 대화내용이 이긴다(기획 파서와 같은 규칙. 프롬프트는 지시일 뿐 계약이 아니다)
 */
function toSegments(raw: unknown): RefinedSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: RefinedSegment[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const sceneComposition = str(o.sceneComposition);
    const dialogue = str(o.dialogue);
    const narration = dialogue ? '' : str(o.narration);
    if (!sceneComposition && !dialogue && !narration) continue;
    out.push({ sceneComposition, dialogue, narration });
  }
  return out;
}

/** 문자열 배열 → 빈 줄을 뺀 줄 목록. 문자열 하나로 오면 줄바꿈으로 나눈다. 그 외는 빈 배열 */
function toLines(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
  return items.map((v) => str(v)).filter((v) => v.length > 0);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
