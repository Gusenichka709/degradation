import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAP_COLS,
  MAP_ROWS,
  SPAWN_TILE,
  TILE_GRID,
  TILE_KINDS,
  feetCollide,
  isSolidTile,
  spawnPoints,
} from '@game/shared';

test('карта прямоугольная и из известных клеток', () => {
  assert.equal(TILE_GRID.length, MAP_ROWS);
  const known = new Set(TILE_KINDS.map((kind) => kind.index));
  for (const row of TILE_GRID) {
    assert.equal(row.length, MAP_COLS);
    for (const index of row) assert.ok(known.has(index), `неизвестная клетка ${index}`);
  }
});

test('за краем карты — стена', () => {
  assert.equal(isSolidTile(-1, 5), true);
  assert.equal(isSolidTile(MAP_COLS, 5), true);
  assert.equal(isSolidTile(5, -1), true);
  assert.equal(isSolidTile(5, MAP_ROWS), true);
});

test('там, где появляются игроки, можно стоять', () => {
  assert.equal(isSolidTile(SPAWN_TILE.col, SPAWN_TILE.row), false);
  const points = spawnPoints();
  assert.ok(points.length >= 5, 'вокруг точки появления слишком мало места');
  for (const point of points) assert.equal(feetCollide(point.x, point.y), false);
});

test('из точки появления можно дойти до любой проходимой клетки', () => {
  const key = (col: number, row: number) => `${col},${row}`;
  const seen = new Set([key(SPAWN_TILE.col, SPAWN_TILE.row)]);
  const queue = [SPAWN_TILE];
  while (queue.length > 0) {
    const { col, row } = queue.shift()!;
    for (const [c, r] of [
      [col + 1, row],
      [col - 1, row],
      [col, row + 1],
      [col, row - 1],
    ] as const) {
      if (!isSolidTile(c, r) && !seen.has(key(c, r))) {
        seen.add(key(c, r));
        queue.push({ col: c, row: r });
      }
    }
  }
  const unreachable: string[] = [];
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (!isSolidTile(col, row) && !seen.has(key(col, row))) unreachable.push(key(col, row));
    }
  }
  assert.deepEqual(unreachable, [], 'есть клетки, до которых не дойти');
});
