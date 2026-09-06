import { Injectable } from '@nestjs/common';
import { AiToolKey } from '@csc/entitlements';
import { ACTIVITY_LOG_NAMESPACE, deterministicEventId } from '@csc/log-client';
import { LogKind, LogLevel, LogScope, PrincipalType } from '@csc/log-contracts';
import { getRequestId, getTraceId } from '@csc/net-utils';
import type { ActivityLogEntry, ActivityLogPort } from '../../../domain/activity-log';
import { MarketingLogProducerService } from './marketing-log-producer.service';

/**
 * ActivityLogPort 구현: 도메인 활동을 로그 엔벨로프로 변환. 계약 지식이 여기서 끝난다.
 *
 * kind=AUDIT 인 이유: audit_logs 만 TTL 이 없어 청구 금액 증빙이 삭제되지 않음
 * scope=AI_TOOL 인 이유: 나중에 플랫폼 화면이 도구 축으로 슬라이스할 수 있게 함
 * payload 키를 snake_case 로 쓰는 이유: 수집 매퍼의 컬럼 승격 관례와 맞춰 프로듀서 수정 회피
 */
@Injectable()
export class ActivityLogAdapter implements ActivityLogPort {
  constructor(private readonly producer: MarketingLogProducerService) {}

  log(entry: ActivityLogEntry): void {
    // trace/request 는 지금 읽는다. flush 시점에 읽으면 무관한 요청의 trace 가 붙음
    this.producer.enqueue({
      kind: LogKind.Audit,
      // 실패는 WARN. kind 가 이미 '감사'를 말하므로 level 은 결과의 좋고 나쁨만 표현
      level: entry.failed ? LogLevel.Warn : LogLevel.Info,
      scope: LogScope.AiTool,
      aiTool: AiToolKey.MarketingVideo,
      // service 는 서버가 서비스토큰 클레임으로 덮어씀. 여기 값은 계약 검증 통과용
      service: 'csc-marketing',
      action: `marketing.${entry.action}`,
      message: entry.message,
      organizationId: entry.organizationId,
      actor: { principalType: PrincipalType.OrganizationUser, actorId: entry.actorUserId },
      traceId: getTraceId() ?? null,
      requestId: getRequestId() ?? null,
      jobId: entry.jobId ?? null,
      durationMs: entry.durationMs ?? null,
      tokenInput: entry.usage?.tokenInput ?? null,
      tokenOutput: entry.usage?.tokenOutput ?? null,
      eventId: entry.dedupeKey
        ? deterministicEventId(ACTIVITY_LOG_NAMESPACE, entry.dedupeKey)
        : undefined,
      payload: buildPayload(entry),
    });
  }
}

/** 도메인 부가 정보를 payload(snake_case)로 변환. 값이 없는 키는 넣지 않음 */
function buildPayload(entry: ActivityLogEntry): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...entry.detail };

  // channel_id 는 뷰어의 채널 필터가 JSON 추출로 읽는 키(승격 후보라 이름 고정)
  if (entry.channelId != null) payload.channel_id = entry.channelId;
  // 도구 버전: 조직 전체 원장에서 두 버전을 가릴 유일한 근거(승격 후보라 이름 고정)
  if (entry.version) payload.version = entry.version;
  if (entry.target) {
    payload.target_kind = entry.target.kind;
    payload.target_id = entry.target.id;
  }
  if (entry.cost) {
    payload.cost = {
      // 스키마 버전: 형태 변경이나 컬럼 승격 시 리더가 분기할 근거
      v: 1,
      status: entry.cost.status,
      ...(entry.cost.microUsd !== undefined ? { micro_usd: entry.cost.microUsd } : {}),
      ...(entry.cost.rateVersion ? { rate_version: entry.cost.rateVersion } : {}),
      model: entry.cost.model,
      ...(entry.cost.billing ? { billing: entry.cost.billing } : {}),
      ...(entry.cost.units ? { units: entry.cost.units } : {}),
      ...(entry.cost.breakdown
        ? {
            breakdown: entry.cost.breakdown.map((line) => ({
              unit: line.unit,
              units: line.units,
              micro_usd: line.microUsd,
            })),
          }
        : {}),
    };
  }
  return payload;
}
