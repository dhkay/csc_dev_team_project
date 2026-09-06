import { reserveOnce } from '../reserve-once';

/**
 * 예약 INSERT 의 멱등성
 *
 * 사가 러너는 단계를 실행한 뒤에 진행을 기록하므로, 그 쓰기 전에 죽으면 예약 단계가 한 번 더
 * 돈다. 그때 두 번째 INSERT 는 멱등키 부분 유니크에 걸린다. 여기서 접지 않으면 사가가 23505 로
 * 죽고, 첫 실행이 만든 행의 id 는 컨텍스트에 없어(그 쓰기 직전에 죽었다) 보상도 그 행을 못 지운다.
 * 남는 것은 아무도 렌더하지 않는 PENDING 행이다.
 */
describe('reserveOnce', () => {
  it('충돌이 없으면 넣은 행을 그대로 돌려준다', async () => {
    const row = await reserveOnce(
      async () => [{ id: 1 }],
      async () => {
        throw new Error('충돌이 없으면 기존 행을 찾지 않는다');
      },
      '원천 영상',
    );
    expect(row).toEqual({ id: 1 });
  });

  it('충돌을 삼켰으면 같은 멱등키의 기존 행을 돌려준다', async () => {
    // 이것이 재실행 안전성의 전부다. 두 번째 실행이 첫 실행과 같은 id 를 받아야 뒤 단계가
    //   같은 행에 잡을 붙이고, 화면이 그 행 하나를 본다.
    const row = await reserveOnce(
      async () => [], // onConflictDoNothing 이 삼키면 returning 이 빈 배열이다
      async () => ({ id: 42 }),
      '원천 영상',
    );
    expect(row).toEqual({ id: 42 });
  });

  it('충돌했는데 기존 행이 없으면 멈춘다', async () => {
    // 제약과 조회 조건이 어긋난 상태다. 조용히 넘어가면 뒤 단계가 없는 행을 붙들고 돈다.
    await expect(
      reserveOnce(
        async () => [],
        async () => null,
        '원천 영상',
      ),
    ).rejects.toThrow(/기존 행을 찾지 못했습니다/);
  });
});
