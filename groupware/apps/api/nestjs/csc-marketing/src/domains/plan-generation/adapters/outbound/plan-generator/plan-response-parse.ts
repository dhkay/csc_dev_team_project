// LLM 응답 텍스트를 기획안 배열로 되찾는 일. 버전별 어댑터가 공유한다.
// 공유해도 되는 이유: 여기 있는 것은 전부 벤더가 텍스트를 어떻게 끊는지에 관한 것(코드펜스, 서두, 잘림)
// 씬 어휘는 없음. parseProposalArray 가 매퍼를 인자로 받아 기획안 안쪽을 알 방법이 없다.
// BGM 은 예외로 여기 있다(두 버전의 스키마와 폴백 규칙이 똑같아 갈릴 자리가 없음)
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { PlanBgmEntity, PlanProposalEntity, PlanSceneEntity } from '../../../core/domain';
import { AudioAssetCandidate } from '../../../core/application/ports/outbound';

const _logger = new Logger('PlanGenerator');

/** 응답 기획안의 scenes 배열. 없거나 배열이 아니면 빈 배열 */
export function proposalScenes(raw: unknown): unknown[] {
  const o = (raw ?? {}) as Record<string, unknown>;
  return Array.isArray(o.scenes) ? o.scenes : [];
}

/**
 * 기획안 봉투(id, title, summary, scenes, bgm). 버전의 사실이 아니라 엔티티의 모양
 * 씬 안쪽만 갈리므로 씬은 그 버전이 만들어 넘김(이 함수는 씬을 만들지 않음)
 * 봉투를 공유하는 이유는 id 폴백과 BGM 폴백 규칙이 조용히 갈릴 수 있기 때문
 */
export function toProposalEnvelope(
  raw: unknown,
  idx: number,
  scenes: PlanSceneEntity[],
  bgmById: Map<number, AudioAssetCandidate>,
): PlanProposalEntity {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(o.id) || `plan-${idx + 1}`,
    title: str(o.title),
    summary: str(o.summary),
    scenes,
    bgm: resolveBgm(o.bgm, bgmById),
  };
}

/**
 * 응답 텍스트를 기획안 배열로 변환. 매퍼가 기획안 하나의 모양을 정함
 * 코드펜스와 서두 제거 후 배열 파싱, 실패하면 마지막 완결 객체까지 복구를 1회 시도
 */
export function parseProposalArray<T>(
  raw: string,
  limit: number,
  toProposal: (raw: unknown, idx: number) => T,
): T[] {
  const body = jsonArrayBody(raw);
  // 완전한 배열 시도 후 실패하면 잘린 배열 복구(마지막 완결 '}' 까지 + ']')
  const parsed = tryParse(completeArray(body)) ?? tryParse(salvageTruncatedArray(body));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    // 읽지 못한 텍스트를 남긴다. 없으면 모델이 무엇을 돌려줬는지 알 방법이 없어 진단이 막힌다.
    // 원인을 셋으로 가르는 이유는 대응이 다르기 때문(빈 응답은 재시도, 잘림은 계수, 형식은 프롬프트)
    // 꼬리를 함께 남기는 이유: 잘림은 끝이 어떻게 끊겼는지로만 판별된다.
    _logger.error(
      `기획서 생성 결과 파싱 실패(${diagnoseParseFailure(raw)}): 길이=${raw.length}` +
        ` 앞=${JSON.stringify(raw.slice(0, 200))} 뒤=${JSON.stringify(raw.slice(-120))}`,
    );
    throw new InternalServerErrorException('기획서 생성 결과를 해석하지 못했습니다.');
  }
  return parsed.slice(0, limit).map((p, i) => toProposal(p, i));
}

function tryParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** 코드펜스와 서두 텍스트 제거 후 첫 '[' 부터의 본문. 끝은 복구가 처리 */
function jsonArrayBody(raw: string): string {
  const text = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('[');
  return start === -1 ? text : text.slice(start);
}

/**
 * 파싱 실패의 원인 분류(로그 전용). 대응이 갈리는 만큼만 나눔
 * 잘림을 닫는 괄호의 부재로 판정하는 이유: 끝까지 쓰면 반드시 ']' 로 닫으므로 없으면 예산 부족
 */
function diagnoseParseFailure(raw: string): string {
  if (raw.trim().length === 0) return '빈 응답';
  if (!raw.includes('[')) return '형식: 배열이 아님';
  return raw.trimEnd().endsWith(']') ? '형식: 배열이나 내용이 비었음' : '잘림: 닫히지 않음';
}

/** 완전한 배열: 마지막 ']' 까지 */
function completeArray(body: string): string {
  const end = body.lastIndexOf(']');
  return end > 0 ? body.slice(0, end + 1) : body;
}

/** 토큰 한도로 잘린 배열 복구. 마지막 완결 '}' 까지 취해 ']' 로 닫아 일부라도 살림 */
function salvageTruncatedArray(body: string): string {
  const lastObjEnd = body.lastIndexOf('}');
  return lastObjEnd === -1 ? body : `${body.slice(0, lastObjEnd + 1)}]`;
}

/**
 * BGM 해석(필수 보장). LLM 이 고른 assetId 를 후보 맵으로 검증해 스냅샷
 * 무효나 누락이어도 후보가 있으면 첫 후보로 폴백하고 후보가 없으면 null(렌더에서 강제)
 */
function resolveBgm(
  raw: unknown,
  byId: Map<number, AudioAssetCandidate>,
): PlanBgmEntity | null {
  const chosen = toBgm(raw, byId);
  if (chosen) return chosen;
  const fallback = byId.values().next().value as AudioAssetCandidate | undefined;
  return fallback ? snapshot(fallback) : null;
}

/** 선택된 BGM id 를 스냅샷으로 변환. 후보에 없으면 null */
function toBgm(raw: unknown, byId: Map<number, AudioAssetCandidate>): PlanBgmEntity | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = Number(o.assetId);
  const c = Number.isInteger(id) ? byId.get(id) : undefined;
  return c ? snapshot(c) : null;
}

/** 후보를 선택 시점 스냅샷으로 변환 */
export function snapshot(c: AudioAssetCandidate): PlanBgmEntity {
  return { assetId: c.id, uploadId: c.uploadId, name: c.name };
}

/** 비어있지 않은 문자열. 앞뒤 공백은 뜻이 아니라 형식이라 제거 */
export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
