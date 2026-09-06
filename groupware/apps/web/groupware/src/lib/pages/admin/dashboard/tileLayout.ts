import type { Tile, TileSize } from '$lib/shared/lib/stores/tilesStore/tile.types';

/**
 * 타일 그리드 배치 설정 + 패킹 로직(순수 함수. UI 조정 로직은 feature 레이어에 둔다)
 *
 * 그리드는 동일 폭 열(auto-fill)로 구성되고 각 열이 하나의 슬롯이다. 슬롯은 세로로
 * `SLOT_ROW_UNITS` 만큼의 용량을 가지며 타일을 위에서부터 채우고 가득 차면 다음 슬롯으로 넘어간다.
 * 2x1 타일 둘은 한 슬롯에 세로로 쌓이고 가로로 나란히 놓이지 않는다.
 *
 * 새 타일 크기는 `TileSize` 유니온과 아래 `TILE_ROW_SPAN` 만 넓히면 된다.
 */

/** 한 슬롯의 세로 용량(행 단위) */
export const SLOT_ROW_UNITS = 2;

/** 1 행 단위 높이(rem) → 슬롯 높이 = SLOT_ROW_UNITS * ROW_UNIT_REM (내부 전용) */
const ROW_UNIT_REM = 10.8; // 2x2 = 21.6rem: 내정보 카드 콘텐츠가 들어가도록

/** 그리드 열 최소 폭(rem): auto-fill 기준 (작을수록 열 개수 ↑) */
// ROW_UNIT_REM 과 동일 배수로 키워 카드 비율(폭:높이)을 유지한다.
export const MIN_COLUMN_REM = 16.5;

/** 타일 크기별 세로 점유 행 단위: 새 크기 추가 시 여기에 한 줄 추가 */
const TILE_ROW_SPAN: Record<TileSize, number> = {
  '2x2': 2,
  '2x1': 1,
};

/** 슬롯 높이(rem) */
export const SLOT_HEIGHT_REM = SLOT_ROW_UNITS * ROW_UNIT_REM;

export interface SlotItem {
  tile: Tile;
  // 세로 점유 행 단위 (flex 비율로 사용)
  rowSpan: number;
}

export interface Slot {
  key: string;
  items: SlotItem[];
  // 사용된 행 단위 합. `SLOT_ROW_UNITS` 보다 작으면 남는 공간은 스페이서로 채운다.
  usedUnits: number;
}

/** 평면 타일 배열 → 세로 슬롯 배열 */
export function packTilesIntoSlots(tiles: Tile[]): Slot[] {
  const slots: Slot[] = [];
  let items: SlotItem[] = [];
  let used = 0;

  const flush = (): void => {
    if (items.length === 0) return;
    slots.push({ key: items.map((i) => i.tile.id).join('+'), items, usedUnits: used });
    items = [];
    used = 0;
  };

  for (const tile of tiles) {
    const rowSpan = TILE_ROW_SPAN[tile.size] ?? 1;
    if (used + rowSpan > SLOT_ROW_UNITS) flush();
    items.push({ tile, rowSpan });
    used += rowSpan;
    if (used >= SLOT_ROW_UNITS) flush();
  }
  flush();

  return slots;
}
