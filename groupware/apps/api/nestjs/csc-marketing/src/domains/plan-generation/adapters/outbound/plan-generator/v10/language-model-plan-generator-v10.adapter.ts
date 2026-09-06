// v1.0 기획 생성 어댑터: language-model 서비스로 실제 LLM 생성
// 이 버전은 서로 다른 기획안 여러 개를 한 번에 받으므로 토큰 예산이 기획안 수 x 씬 수로 커지고 다양성이 높다.
// 프롬프트는 조립된 채로 온다(조립 규칙이 버전마다 갈리는데 어댑터는 버전을 모른다)
// language-model 에 JSON 모드가 없어 출력 형식은 프롬프트로만 강제되고 파싱은 호출측 몫이다.
import { Injectable } from '@nestjs/common';
import { LanguageModelApiClientService } from '../../../../../../shared/adapters/outbound/language-model-api';
import { PlanProposalEntity } from '../../../../core/domain';
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
  toProposalEnvelope,
} from '../plan-response-parse';
import { capInfographicsToOne, toScene } from './scene';

// 출력 토큰 추정 계수. 모델 창은 여기서 추측하지 않고 모델을 아는 language-model 이 깎는다.
// 이 값은 상한이지 비용이 아니라(청구는 실제 생성분에만) 넉넉히 잡아 잃는 것이 없다.
// 반대로 빠듯하면 출력이 잘려 요청 전체를 잃으므로 계수는 평균이 아니라 최댓값에 맞춘다.
const TOKENS_PER_SCENE = 1_200;
const TOKENS_PER_PROPOSAL = 1_200;
const TOKENS_BASE = 1_000;
const TOKENS_MARGIN = 1.5;

// 다양성. 서로 다른 기획안 여러 개가 나와야 하므로 높게 둔다(낮추면 고를 이유가 사라짐)
const TEMPERATURE = 0.9;

function estimateMaxTokens(proposalCount: number, sceneCount: number): number {
  const need =
    TOKENS_BASE + proposalCount * (TOKENS_PER_PROPOSAL + sceneCount * TOKENS_PER_SCENE);
  return Math.ceil(need * TOKENS_MARGIN);
}

/** v1.0 기획 생성 어댑터 */
@Injectable()
export class LanguageModelPlanGeneratorV10Adapter implements PlanGeneratorPort {
  constructor(private readonly client: LanguageModelApiClientService) {}

  async generate(context: PlanGenerationContext): Promise<PlanGenerationResult> {
    const estimatedOutputTokens = estimateMaxTokens(context.proposalCount, context.sceneCount);
    const res = await callTextGenerate(this.client, {
      organizationId: context.organizationId,
      model: context.model,
      systemPrompt: context.systemPrompt,
      userPrompt: context.userPrompt,
      maxTokens: estimatedOutputTokens,
      temperature: TEMPERATURE,
    });
    // 후보 id 로 맵을 만들어 파서가 선택 id 를 스냅샷으로 enrich 하고 검증. 삽입 순서가 sortOrder
    const bgmById = new Map<number, AudioAssetCandidate>(
      context.bgmCandidates.map((c) => [c.id, c]),
    );
    const sfxById = new Map<number, AudioAssetCandidate>(
      (context.sfxCandidates ?? []).map((c) => [c.id, c]),
    );
    return {
      proposals: parseProposalArray(res?.text ?? '', context.proposalCount, (raw, idx) =>
        toProposal(raw, idx, bgmById, sfxById),
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
  sfxById: Map<number, AudioAssetCandidate>,
): PlanProposalEntity {
  const scenes = proposalScenes(raw).map((s, i) => toScene(s, i, sfxById));
  capInfographicsToOne(scenes); // 기획안당 인포그래픽 1개 이하 보장
  return toProposalEnvelope(raw, idx, scenes, bgmById);
}
