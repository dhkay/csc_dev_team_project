/**
 * 결정적 event id: 같은 사건을 두 번 관측해도 같은 id 가 나오게 한다.
 *
 * 왜 필요한가: 렌더 완료는 워커가 알려주는 게 아니라 폴링으로 관측된다. 탭 두 개가 동시에
 * 목록을 조회하면 같은 종료 전이를 둘이 볼 수 있다. 그때 무작위 id 를 쓰면 같은 사건이 두 행이
 * 된다. 잡 id + 상태로 id 를 유도해 두면 재생/백필도 멱등해진다.
 *
 * 한계(중요): 이것만으로는 저장소 중복 제거가 보장되지 않는다. audit_logs 는
 * `ReplacingMergeTree(ingested_at) ORDER BY (organization_id, action, occurred_at, event_id)` 라
 * 중복 판정 키가 정렬키 전체 튜플이고, 두 관측의 occurred_at 은 보통 다르다. 그래서 1차
 * 방어는 DB 조건부 갱신(전이를 실제로 기록한 쪽만 로그를 남긴다)이고 이 함수는 보조 수단이다.
 *
 * UUIDv5(name-based, SHA-1)를 직접 구현한다. 의존성을 하나 늘릴 만한 로직이 아니다.
 */

import { createHash } from 'node:crypto';

/** 활동 로그 네임스페이스 UUID. 값이 바뀌면 과거 id 와 어긋나므로 고정한다. */
export const ACTIVITY_LOG_NAMESPACE = '6b1f2c4e-5d3a-4b8e-9f07-2a1c8d5e4b30';

function namespaceToBytes(namespace: string): Buffer {
  const hex = namespace.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error(`네임스페이스 UUID 형식이 아닙니다: ${namespace}`);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * RFC 4122 §4.3 UUIDv5: sha1(namespace || name) 의 앞 16바이트에 버전/변이 비트를 박는다.
 * 같은 (namespace, name) 은 항상 같은 결과다.
 */
export function deterministicEventId(namespace: string, name: string): string {
  const digest = createHash('sha1')
    .update(namespaceToBytes(namespace))
    .update(Buffer.from(name, 'utf8'))
    .digest();

  const bytes = Buffer.from(digest.subarray(0, 16));
  // 버전 5: 상위 4비트를 0101 로. 변이(variant) RFC4122: 상위 2비트를 10 으로
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
