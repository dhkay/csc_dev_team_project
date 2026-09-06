// v1.5 기획 생성 어댑터: language-model 서비스로 실제 LLM 생성
// 이 버전은 영상 한 편(기획안 1개 + 동영상 단위 세그먼트 N개)이라 예산이 세그먼트 수로만 커지고 다양성이 낮다.
// v1.0 과 파일이 갈린 이유: 응답 스키마가 겹치지 않음(여기 씬은 sceneComposition, dialogue, narration 셋뿐)
// 한 어댑터가 두 스키마를 다 읽던 동안 v1.0 의 imagePrompt 폴백이 이 버전 결과에도 걸렸다.
import { Injectable } from '@nestjs/common';
import { LanguageModelApiClientService } from '../../../../../../shared/adapters/outbound/language-model-api';
import { PlanProposalEntity, PlanSceneEntity } from '../../../../core/domain';
import {
  PlanGeneratorPort,
  PlanGenerationContext,
  PlanGenerationResult,
  AudioAssetCandidate,
} from '../../../../core/application/ports/outbound';
import { callTextGenerate, toUsage } from '../../text-generate-call';
import {
  parseProposalArray,
  proposalScenes,
  str,
  toProposalEnvelope,
} from '../plan-response-parse';

// 출력 토큰 예산. 기획안 수로 곱하지 않음(이 버전은 늘 한 편)
// 계수를 v1.0 과 따로 두는 이유: 세그먼트 하나의 출력이 더 크고 이미지 프롬프트와 자막이 없음
// 하나뿐인 기획안이 잘리면 부분 복구가 듣지 않으므로 평균이 아니라 최댓값에 맞춘다.
const TOKENS_PER_SEGMENT = 1_400;
const TOKENS_BASE = 1_200;
const TOKENS_MARGIN = 1.5;

// 다양성. v1.0 보다 낮음(한 편이 곧 결과물이라 크게 흔들리면 다시 만들기가 도박이 됨)
const TEMPERATURE = 0.7;

function estimateMaxTokens(segmentCount: number): number {
  return Math.ceil((TOKENS_BASE + segmentCount * TOKENS_PER_SEGMENT) * TOKENS_MARGIN);
}

/** v1.5 기획 생성 어댑터 */
@Injectable()
export class LanguageModelPlanGeneratorV15Adapter implements PlanGeneratorPort {
  constructor(private readonly client: LanguageModelApiClientService) {}

  async generate(context: PlanGenerationContext): Promise<PlanGenerationResult> {
    const estimatedOutputTokens = estimateMaxTokens(context.sceneCount);
    const res = await callTextGenerate(this.client, {
      organizationId: context.organizationId,
      model: context.model,
      systemPrompt: context.systemPrompt,
      userPrompt: context.userPrompt,
      maxTokens: estimatedOutputTokens,
      temperature: TEMPERATURE,
    });
    // BGM 후보 맵(삽입 순서가 sortOrder). 효과음 맵은 만들지 않음(이 버전 씬에 효과음 자리가 없음)
    const bgmById = new Map<number, AudioAssetCandidate>(
      context.bgmCandidates.map((c) => [c.id, c]),
    );
    return {
      proposals: parseProposalArray(res?.text ?? '', context.proposalCount, (raw, idx) =>
        toProposal(raw, idx, bgmById),
      ),
      usage: toUsage(res, context.model),
      estimatedOutputTokens,
    };
  }
}

function toProposal(
  raw: unknown,
  idx: number,
  bgmById: Map<number, AudioAssetCandidate>,
): PlanProposalEntity {
  return toProposalEnvelope(raw, idx, proposalScenes(raw).map(toScene), bgmById);
}

/**
 * LLM 씬 객체를 도메인 씬(v1.5 스키마)으로 변환
 * 이 버전의 세그먼트가 갖는 것만 싣고 v1.0 어휘는 키 자체를 두지 않음(부재가 그대로 형식)
 * 빈 문자열로 채우던 동안 읽는 쪽에서 오독이 났음
 */
function toScene(raw: unknown, idx: number): PlanSceneEntity {
  const o = (raw ?? {}) as Record<string, unknown>;
  const dialogue = str(o.dialogue);
  const scene: PlanSceneEntity = {
    index: idx + 1, // 1-base 재부여. LLM 이 준 index 는 무시하고 순서만 신뢰
    // 동영상 하나의 말은 둘 중 하나. 둘 다 오면 대화내용 우선(프롬프트는 지시일 뿐이라 여기서 강제)
    narration: dialogue ? '' : str(o.narration),
  };
  // 빈 값이면 싣지 않음(부재가 곧 "그 씬에는 그것이 없다")
  const sceneComposition = str(o.sceneComposition);
  if (sceneComposition) scene.sceneComposition = sceneComposition;
  if (dialogue) scene.dialogue = dialogue;
  return scene;
}
