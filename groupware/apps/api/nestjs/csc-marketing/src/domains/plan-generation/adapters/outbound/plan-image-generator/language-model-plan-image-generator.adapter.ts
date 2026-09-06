import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LanguageModelApiClientService } from '../../../../../shared/adapters/outbound/language-model-api';
import {
  PlanImageGeneratorPort,
  PlanImageContext,
  PlanImageResult,
  PlanImageUsage,
  PlanImageEngineLoad,
} from '../../../core/application/ports/outbound';

/** language-model /inference/images 응답 형태. 선언하지 않은 필드는 타입 경계에서 버려진다. */
interface ImagesResult {
  images: { b64: string; mime: string }[];
  model: string;
  // 벤더 사용량(camelCase: LLM 서버 스키마). 자체 모델/구 버전 서버는 없다.
  usage?: {
    inputText?: unknown;
    inputImage?: unknown;
    outputImage?: unknown;
  } | null;
}

/** 응답 usage → 도메인 사용량. 숫자가 아니면 null(NaN 이 금액 계산으로 흘러가면 안 된다) */
function toImageUsage(res: ImagesResult | null, fallbackModel: string): PlanImageUsage | null {
  const raw = res?.usage;
  if (!raw) return null;
  const inputTextTokens = Number(raw.inputText ?? 0);
  const inputImageTokens = Number(raw.inputImage ?? 0);
  const outputImageTokens = Number(raw.outputImage ?? 0);
  if (
    !Number.isFinite(inputTextTokens) ||
    !Number.isFinite(inputImageTokens) ||
    !Number.isFinite(outputImageTokens)
  ) {
    return null;
  }
  return {
    // 서버가 준 resolve 결과를 우선: 요청 모델이 빈 값이면 그게 유일한 귀속 근거다.
    model: res?.model || fallbackModel,
    inputTextTokens,
    inputImageTokens,
    outputImageTokens,
  };
}

/** language-model /inference/images/load 응답: 큐 없는 벤더는 null. */
interface EngineLoadResult {
  running: number;
  pending: number;
}

/**
 * PlanImageGeneratorPort 구현: language-model 서비스로 실제 이미지 생성
 * 요청한 사람이 선택한 이미지 모델(context.model)로 /inference/images 를 호출한다.
 * 조직 OpenAI 키 해석/벤더 호출은 language-model 이 담당(여기선 프롬프트만 전달)
 */
@Injectable()
export class LanguageModelPlanImageGeneratorAdapter implements PlanImageGeneratorPort {
  constructor(private readonly client: LanguageModelApiClientService) {}

  async generate(context: PlanImageContext): Promise<PlanImageResult> {
    const res = await this.client.post<ImagesResult>('/inference/images', {
      organizationId: String(context.organizationId),
      model: context.model,
      prompt: context.prompt,
      size: context.size,
      quality: context.quality,
      seed: context.seed,
    });
    const img = res?.images?.[0];
    if (!img?.b64) {
      throw new InternalServerErrorException('이미지 생성 결과가 비어 있습니다.');
    }
    return {
      b64: img.b64,
      mimeType: img.mime || 'image/png',
      usage: toImageUsage(res, context.model),
    };
  }

  async engineLoad(model: string): Promise<PlanImageEngineLoad | null> {
    // 보조 정보(부하 표시): 실패는 null 로 접는다. 이걸로 화면에 에러를 띄우면 배보다 배꼽이 크다.
    //   큐 없는 벤더(외부)는 LLM 서버가 null 을 준다(그대로 전달)
    try {
      const res = await this.client.get<EngineLoadResult | null>(
        `/inference/images/load?model=${encodeURIComponent(model)}`,
      );
      return res ? { running: res.running, pending: res.pending } : null;
    } catch {
      return null;
    }
  }
}
