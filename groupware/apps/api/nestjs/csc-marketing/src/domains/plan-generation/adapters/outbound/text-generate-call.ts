// language-model 텍스트 생성 엔드포인트 호출의 전송 계층
// 이 엔드포인트를 부르는 어댑터 셋(기획 생성 둘, 키워드 보완 하나)이 공유해 형제 자리에 둔다.
// 공유하는 것은 누가 무엇을 물었는지와 무관한 것뿐(엔드포인트, body 모양, usage 필드 이름)
// 씬 어휘는 오지 않는다. 한 어댑터가 두 스키마를 다 읽으면 한 버전의 폴백이 다른 버전에 새어 든다.
// maxTokens 와 temperature 를 인자로 받는 이유도 같다(세 소비자의 값이 전부 다르다)
import { LanguageModelApiClientService } from '../../../../shared/adapters/outbound/language-model-api';
import { PlanGenerationUsage } from '../../core/application/ports/outbound';

/** language-model `/inference/generate` 응답. 선언한 필드만 읽히고 나머지는 버려짐 */
export interface GenerateResult {
  text: string;
  // 서버가 resolve 한 모델 key. 구 버전 서버는 요청값을 되돌려주거나 빈 값일 수 있음
  model?: string;
  // 벤더 사용량. 구 버전 서버(롤링 배포 중)엔 없어 null 로 다룸
  usage?: { prompt?: unknown; completion?: unknown; total?: unknown } | null;
}

// 생성 호출 인자. 프롬프트는 조립된 채로 오고(조립은 버전별 조립기의 일) 이름으로 쓰는 곳이 없어 미노출
interface TextGenerateCall {
  organizationId: number;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  // 이 요청이 필요하다고 보는 출력 토큰. 모델 창에 맞춰 깎는 일은 language-model 담당
  maxTokens: number;
  // 다양성. 그 버전이 무엇을 만드는지에 달린 값이라 호출자가 정함
  temperature: number;
}

/** language-model 에 텍스트 생성 요청 */
export function callTextGenerate(
  client: LanguageModelApiClientService,
  call: TextGenerateCall,
): Promise<GenerateResult> {
  return client.post<GenerateResult>('/inference/generate', {
    organizationId: String(call.organizationId),
    model: call.model,
    system: call.systemPrompt,
    messages: [{ role: 'user', content: call.userPrompt }],
    maxTokens: call.maxTokens,
    temperature: call.temperature,
  });
}

/**
 * 응답 usage 를 도메인 사용량으로 변환
 * prompt→inputTokens, completion→outputTokens 는 이름이 안 비슷해 거꾸로 하기 쉬운 지점
 * 그래서 버전별로 복제하지 않음(복제하면 한쪽만 뒤집혀 그 버전 금액만 조용히 틀림)
 * 숫자가 아니면 전체를 null 로 떨어뜨림(NaN 이 흘러가면 금액이 NaN 이 됨)
 */
export function toUsage(
  res: GenerateResult | null,
  fallbackModel: string,
): PlanGenerationUsage | null {
  const raw = res?.usage;
  if (!raw) return null;
  const inputTokens = tokenCount(raw.prompt);
  const outputTokens = tokenCount(raw.completion);
  if (inputTokens === null || outputTokens === null) return null;
  return {
    // 서버의 resolve 결과 우선. 요청 모델이 빈 값이면 그게 유일한 귀속 근거
    model: res?.model || fallbackModel,
    inputTokens,
    outputTokens,
  };
}

/**
 * 토큰 수 하나. 숫자로 읽히지 않으면 null
 * Number() 를 그냥 쓰면 null 과 빈 문자열, 빈 배열이 모두 0 이 되어 모름이 무료로 위장됨
 * 문자열을 받아 주는 이유: 구 버전 서버가 숫자를 문자열로 실어 보냄
 */
function tokenCount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
