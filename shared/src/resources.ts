import {
  BUSH_GROWTH,
  BUSH_REGROW_MS,
  GATHER_COOLDOWN_MS,
  MINE_COOLDOWN_MS,
  MINE_GROWTH,
  STONE_GROWTH,
  STONE_REGROW_MS,
  TILE_SIZE,
  USE_REACH,
} from './constants';
import { PICKED_BUSH_TILE, PICKED_STONE_TILE, PLACES, TILE_GRID, TILE_KINDS, type PlaceKind } from './map';

/**
 * Что можно собирать по E. Вид важен для приедания: оно считает сборы одного вида подряд.
 * Список мест сервер и клиент строят из одной карты, поэтому номера мест у них совпадают.
 */
export type ResourceKind = 'bush' | 'stone' | 'mine';

export interface ResourceRule {
  /** Буква на карте. */
  char: string;
  /** Во что превращается клетка после сбора, пока не отрастёт. null — не кончается (шахта). */
  pickedTile: number | null;
  /** Через сколько миллисекунд отрастает. */
  regrowMs: number;
  /** Сколько ждать до следующего сбора, мс. */
  cooldownMs: number;
  /** На сколько процентов растёт деградация за один сбор, пока нет приедания. */
  growth: number;
}

export const RESOURCE_RULES: Readonly<Record<ResourceKind, ResourceRule>> = {
  bush: {
    char: 'b',
    pickedTile: PICKED_BUSH_TILE,
    regrowMs: BUSH_REGROW_MS,
    cooldownMs: GATHER_COOLDOWN_MS,
    growth: BUSH_GROWTH,
  },
  stone: {
    char: 'r',
    pickedTile: PICKED_STONE_TILE,
    regrowMs: STONE_REGROW_MS,
    cooldownMs: GATHER_COOLDOWN_MS,
    growth: STONE_GROWTH,
  },
  mine: { char: 'm', pickedTile: null, regrowMs: 0, cooldownMs: MINE_COOLDOWN_MS, growth: MINE_GROWTH },
};

/** Одно место сбора на карте. id — номер в RESOURCE_SPOTS. */
export interface ResourceSpot {
  id: number;
  kind: ResourceKind;
  col: number;
  row: number;
}

function findSpots(): ResourceSpot[] {
  const kindByIndex = new Map<number, ResourceKind>();
  for (const [kind, rule] of Object.entries(RESOURCE_RULES) as [ResourceKind, ResourceRule][]) {
    const tile = TILE_KINDS.find((t) => t.char === rule.char);
    if (tile) kindByIndex.set(tile.index, kind);
  }
  const spots: ResourceSpot[] = [];
  TILE_GRID.forEach((cells, row) => {
    cells.forEach((index, col) => {
      const kind = kindByIndex.get(index);
      if (kind) spots.push({ id: spots.length, kind, col, row });
    });
  });
  return spots;
}

/** Все кусты, камни и шахты деревни — сверху вниз, слева направо. */
export const RESOURCE_SPOTS: readonly ResourceSpot[] = findSpots();

/** Сколько пикселей от точки (ноги персонажа) до ближайшего края клетки. 0 — точка в клетке или на краю. */
export function distanceToTile(x: number, y: number, col: number, row: number): number {
  const left = col * TILE_SIZE;
  const top = row * TILE_SIZE;
  const dx = Math.max(left - x, 0, x - (left + TILE_SIZE));
  const dy = Math.max(top - y, 0, y - (top + TILE_SIZE));
  return Math.hypot(dx, dy);
}

/** То, что можно сделать по E: собрать куст, камень, шахту или зайти в дверь (библиотека, травница). */
export type Usable = { type: 'spot'; spot: ResourceSpot } | { type: 'place'; place: PlaceKind };

/** Ближайшее, до чего можно дотянуться из точки (x, y), или null. */
export function usableInReach(x: number, y: number): Usable | null {
  let best: Usable | null = null;
  let bestDistance = USE_REACH;
  const consider = (usable: Usable, col: number, row: number) => {
    const distance = distanceToTile(x, y, col, row);
    if (distance <= bestDistance) {
      best = usable;
      bestDistance = distance;
    }
  };
  for (const spot of RESOURCE_SPOTS) consider({ type: 'spot', spot }, spot.col, spot.row);
  for (const [place, { col, row }] of Object.entries(PLACES) as [PlaceKind, { col: number; row: number }][]) {
    consider({ type: 'place', place }, col, row);
  }
  return best;
}
