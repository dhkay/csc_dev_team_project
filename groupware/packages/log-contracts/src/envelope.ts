/**
 * 로그 엔벨로프: 프로듀서/버퍼/컨슈머/저장소가 공유하는 단 하나의 계약
 *
 * 3축(scope / kind / aiTool+organizationId)이 한 엔벨로프의 차원으로 들어간다.
 * 불변식 검증(`validateEnvelope`)을 계약 안에 두어 프로듀서와 컨슈머가 같은 규칙을 쓴다.
 *
 * 필드명은 snake_case 로 전송한다(Python 측과 바이트 동일). TS 쪽 편의를 위해 camelCase
 * 입력 타입(`LogInput`)을 따로 두고 `toWire` 가 변환한다. 경계에서만 이름이 바뀐다.
 */

import type { AiToolKey } from '@csc/entitlements';
import { LogKind, LogLevel, LogScope, PrincipalType } from './types';

/** 행위 주체: 감사 로그의 '누가' */
export interface Actor {
  principalType: PrincipalType;
  // SERVICE 주체는 id 가 없다.
  actorId?: number | null;
}

/** 프로듀서가 채우는 입력. eventId/occurredAt/environment 는 클라이언트가 보완한다. */
export interface LogInput {
  kind: LogKind;
  level: LogLevel;
  scope: LogScope;
  // 프로듀서 신원: 서비스토큰 service 클레임과 같은 값
  service: string;
  // "video_job.status_changed": 점 표기 고정
  action: string;
  message: string;

  eventId?: string;
  occurredAt?: Date;

  aiTool?: AiToolKey | null;
  organizationId?: number | null;

  // 요청 1건을 서비스 경계 너머로 꿰는 값
  traceId?: string | null;
  requestId?: string | null;
  jobId?: string | null;
  actor?: Actor | null;

  payload?: Record<string, unknown>;
  durationMs?: number | null;
  // LLM 사용량: 조직별 과금/쿼터의 근거
  tokenInput?: number | null;
  tokenOutput?: number | null;

  environment?: string;
}

/** 전송 표현: Python `csc_log_contracts.serde.to_dict` 와 동일한 키/형식 */
export interface LogEnvelopeWire {
  event_id: string;
  occurred_at: string;
  kind: string;
  level: string;
  scope: string;
  service: string;
  ai_tool: string | null;
  organization_id: number | null;
  action: string;
  message: string;
  trace_id: string | null;
  request_id: string | null;
  job_id: string | null;
  actor: { principal_type: string; actor_id: number | null } | null;
  payload: Record<string, unknown>;
  duration_ms: number | null;
  token_input: number | null;
  token_output: number | null;
  environment: string;
}

export class InvalidEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEnvelopeError';
  }
}

/** 불변식 검증. 위반 시 InvalidEnvelopeError. 송신 전에 호출한다. */
export function validateEnvelope(input: LogInput): void {
  if (!input.service) throw new InvalidEnvelopeError('service 는 비어 있을 수 없습니다.');
  if (!input.action) throw new InvalidEnvelopeError('action 은 비어 있을 수 없습니다.');

  if (input.scope === LogScope.Organization && input.organizationId == null) {
    throw new InvalidEnvelopeError('scope=ORGANIZATION 인 로그는 organizationId 가 필요합니다.');
  }
  if (input.scope === LogScope.AiTool && !input.aiTool) {
    throw new InvalidEnvelopeError('scope=AI_TOOL 인 로그는 aiTool 이 필요합니다.');
  }
  if (input.kind === LogKind.Audit && !input.actor) {
    throw new InvalidEnvelopeError('kind=AUDIT 인 로그는 actor 가 필요합니다.');
  }
  if (input.organizationId != null && input.organizationId <= 0) {
    // 0 은 저장소에서 '플랫폼 전역' 센티넬이라 조직 id 로 쓸 수 없다.
    throw new InvalidEnvelopeError('organizationId 는 양수여야 합니다.');
  }
}

/** 입력 → 전송 표현. 누락 필드를 채우고 camelCase → snake_case 로 옮긴다. */
export function toWire(input: LogInput, defaults: { environment: string }): LogEnvelopeWire {
  validateEnvelope(input);
  return {
    event_id: input.eventId ?? crypto.randomUUID(),
    occurred_at: (input.occurredAt ?? new Date()).toISOString(),
    kind: input.kind,
    level: input.level,
    scope: input.scope,
    service: input.service,
    ai_tool: input.aiTool ?? null,
    organization_id: input.organizationId ?? null,
    action: input.action,
    message: input.message,
    trace_id: input.traceId ?? null,
    request_id: input.requestId ?? null,
    job_id: input.jobId ?? null,
    actor: input.actor
      ? { principal_type: input.actor.principalType, actor_id: input.actor.actorId ?? null }
      : null,
    payload: input.payload ?? {},
    duration_ms: input.durationMs ?? null,
    token_input: input.tokenInput ?? null,
    token_output: input.tokenOutput ?? null,
    environment: input.environment ?? defaults.environment,
  };
}

/**
 * Kafka 메시지 키: 조직 단위 순서 보장(조직 타임라인 조회의 전제)
 * organizationId 가 없으면 0(플랫폼 전역), aiTool 이 없으면 '-'
 */
export function partitionKey(input: Pick<LogInput, 'organizationId' | 'aiTool'>): string {
  return `${input.organizationId ?? 0}:${input.aiTool ?? '-'}`;
}
