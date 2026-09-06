import { Injectable } from '@nestjs/common';
import {
  ApiKeyValidationResult,
  ApiKeyValidatorPort,
} from '../../../core/application/ports/outbound';
import { ApiProviderKey } from '../../../core/domain';

const VALIDATE_TIMEOUT_MS = 8000;

/** 확인용 호출 1건의 명세. 프로바이더마다 URL 과 인증 헤더만 다르다. */
interface CredentialProbe {
  // 가장 가벼운 인증 확인 경로(대개 모델 목록)
  url: string;
  // 사용자 메시지에 쓰는 이름. 카탈로그 label 과 달리 문장에 들어갈 짧은 이름이다.
  label: string;
  // 저장될 자격증명 맵 → 인증 헤더. 프로바이더마다 헤더 이름과 형식이 다르다.
  headers: (credentials: Record<string, string>) => Record<string, string>;
}

/**
 * 프로바이더별 확인용 호출 표
 *
 * `Record<ApiProviderKey, ...>`(Partial 이 아니다)이라 카탈로그에 프로바이더를 추가하면 여기를
 * 빠뜨릴 수 없다. switch 의 default 로 두면 조용히 valid:true 를 돌려줘 새 프로바이더가 검증 없이
 * 통과한다.
 *
 * null 은 확인용 호출 경로가 정해지지 않아 형식만 본다는 뜻이고, 카탈로그의
 * `verification: 'format'` 과 짝이다(그 일치는 테스트가 지킨다).
 *
 * 이 표는 외부 호스트로 아웃바운드 egress 를 낸다. 내부망에서 막히면 저장 시 검증이 실패하므로
 * 프로바이더를 추가하면 그 호스트도 함께 허용 목록에 넣는다.
 */
const PROBES: Record<ApiProviderKey, CredentialProbe | null> = {
  // Anthropic 은 Bearer 가 아니라 x-api-key + 버전 헤더를 쓴다.
  ANTHROPIC: {
    url: 'https://api.anthropic.com/v1/models?limit=1',
    label: 'Claude',
    headers: (c) => ({ 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' }),
  },
  OPENAI: {
    url: 'https://api.openai.com/v1/models',
    label: 'OpenAI',
    headers: (c) => ({ Authorization: `Bearer ${c.apiKey}` }),
  },
  // xAI 는 OpenAI 호환이라 경로와 인증 방식이 같다.
  XAI: {
    url: 'https://api.x.ai/v1/models',
    label: 'Grok',
    headers: (c) => ({ Authorization: `Bearer ${c.apiKey}` }),
  },
  // Gemini 는 자체 헤더(x-goog-api-key)를 쓴다. 쿼리 문자열(?key=)로도 받지만 그 자리는 프록시와
  // 액세스 로그에 그대로 남으므로 헤더로 보낸다. /v1beta/models 가 키만으로 되는 가장 가벼운
  // 확인 경로이고, pageSize=1 로 목록 전체를 받지 않는다.
  GEMINI: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
    label: 'Gemini',
    headers: (c) => ({ 'x-goog-api-key': c.apiKey }),
  },
  // ElevenLabs 는 자체 헤더(xi-api-key)를 쓰고, 키 없이 호출하면 응답이 그 헤더 이름을 알려 준다.
  // /v1/user 는 구독 정보만 돌려주는 가장 가벼운 인증 확인 경로다.
  ELEVENLABS: {
    url: 'https://api.elevenlabs.io/v1/user',
    label: 'ElevenLabs',
    headers: (c) => ({ 'xi-api-key': c.apiKey }),
  },
  // 플랫폼 둘은 확인용 엔드포인트와 인증 헤더 이름이 공식 문서로 확정되기 전이다.
  // 추정 URL 을 넣으면 유효한 키가 거부되므로 형식 확인만 한다(카탈로그 verification:'format')
  HIGGSFIELD: null,
  CURSOR: null,
};

/**
 * 프로바이더별 자격증명 실검증 어댑터. 위 표로 분기한다.
 *
 * 통과 기준은 확인용 호출의 200 이다. 실패 사유는 상태 코드만으로 뭉개진다(예: xAI 는 잔액 소진과
 * 키 폐기를 모두 HTTP 400 `{"error":"Incorrect API key provided."}` 로 응답한다). 그래서 실패 시
 * 응답 본문에서 프로바이더가 준 사유를 뽑아(mapFailure) 사용자에게 그대로 전달한다.
 */
@Injectable()
export class ApiKeyValidatorAdapter implements ApiKeyValidatorPort {
  async validate(
    provider: string,
    credentials: Record<string, string>,
  ): Promise<ApiKeyValidationResult> {
    // 카탈로그에 없는 provider 는 상위(서비스)가 이미 거부한다. 여기까지 오면 형식만 통과시킨다.
    const probe = PROBES[provider as ApiProviderKey] ?? null;
    if (!probe) return { valid: true };

    try {
      const res = await fetch(probe.url, {
        method: 'GET',
        headers: probe.headers(credentials),
        signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
      });
      if (res.ok) return { valid: true };
      return this.mapFailure(res, probe.label);
    } catch {
      return {
        valid: false,
        message: `${probe.label} API 서버에 연결할 수 없어 검증하지 못했습니다.`,
      };
    }
  }

  /**
   * 실패 응답(res.ok=false)을 사용자 메시지로 변환
   * 프로바이더가 준 사유(응답 본문 error)를 우선 노출하고(잔액 소진/키 폐기/권한 등 실제 원인 전달),
   * 사유를 못 뽑으면 상태 기반 기본 문구로 폴백한다(401/403=키 무효, 그 외=HTTP 코드 표기)
   */
  private async mapFailure(res: Response, label: string): Promise<ApiKeyValidationResult> {
    const reason = await this.extractProviderError(res);
    if (reason) {
      return { valid: false, message: `${label} API 키를 사용할 수 없습니다: ${reason}` };
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, message: `유효하지 않은 ${label} API 키입니다.` };
    }
    return { valid: false, message: `${label} API 검증에 실패했습니다 (HTTP ${res.status}).` };
  }

  /**
   * 프로바이더 에러 응답 본문에서 사람이 읽을 사유를 뽑는다. 실패/빈값이면 null.
   *
   * 대응 형태:
   *  - xAI/OpenAI      `{"error":"..."}`
   *  - OpenAI/Anthropic `{"error":{"message":"..."}}`
   *  - ElevenLabs       `{"detail":{"message":"Invalid API key", ...}}` (FastAPI 관용)
   *  - 그 외            `{"message":"..."}`
   *
   * JSON 이 아니면 원문 앞부분만(과도한 길이 차단)
   */
  private async extractProviderError(res: Response): Promise<string | null> {
    let text: string;
    try {
      text = await res.text();
    } catch {
      return null;
    }
    if (!text.trim()) return null;
    try {
      const body = JSON.parse(text) as { error?: unknown; detail?: unknown; message?: unknown };
      for (const candidate of [body.error, body.detail]) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        if (candidate && typeof candidate === 'object') {
          const msg = (candidate as { message?: unknown }).message;
          if (typeof msg === 'string' && msg.trim()) return msg.trim();
        }
      }
      if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
      return null;
    } catch {
      return text.trim().slice(0, 200);
    }
  }
}

/**
 * 확인용 호출이 있는 프로바이더인가. 카탈로그의 `verification` 과 이 표가 어긋나지 않는지
 * 테스트가 확인하는 데 쓴다(그 외 용도로 export 하지 않는다)
 */
export function hasCredentialProbe(provider: ApiProviderKey): boolean {
  return PROBES[provider] !== null;
}
