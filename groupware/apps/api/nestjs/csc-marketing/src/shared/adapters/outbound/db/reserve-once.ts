/**
 * 멱등키가 붙은 예약 INSERT: 그 키의 행이 이미 있으면 새로 만들지 않고 그것을 반환
 *
 * 예약은 사가의 첫 단계이고 러너는 실행 뒤에 진행을 기록하므로 재실행이 일어난다. 그냥 INSERT 하면
 * 재실행이 23505 로 죽고 보상이 지울 대상을 몰라 아무도 렌더하지 않는 PENDING 행이 남는다.
 * 계약: docs/specs/marketing-write-consistency.md 4.5 규칙 2
 */
export async function reserveOnce<Row>(
  insert: () => Promise<Row[]>,
  findExisting: () => Promise<Row | null>,
  what: string,
): Promise<Row> {
  const [inserted] = await insert();
  if (inserted) return inserted;

  // 충돌을 삼켰다 = 같은 멱등키의 행이 이미 있고, 그것이 이 단계가 만들려던 행
  const existing = await findExisting();
  if (existing) return existing;

  // 삼킬 충돌이 없었는데 넣지도 못한 경우(제약 변경 또는 조회 조건 불일치). 뒤 단계가 없는 행을 붙들지 않게 중단
  throw new Error(
    `${what} 예약이 충돌했으나 기존 행을 찾지 못했습니다(멱등키 유니크와 조회 조건이 어긋났습니다).`,
  );
}
