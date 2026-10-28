import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FACING_DOWN,
  FACING_LEFT,
  FACING_RIGHT,
  FACING_UP,
  FEET_HEIGHT,
  PLAYER_SPEED,
  SPAWN_TILE,
  TICK_SECONDS,
  TILE_SIZE,
  facingFromAngle,
  feetCollide,
  stepMovement,
  tileCenter,
  type MoveIntent,
  type Point,
} from '@game/shared';

const start = tileCenter(SPAWN_TILE.col, SPAWN_TILE.row);

function walk(from: Point, intent: MoveIntent, ticks: number): Point {
  let position = from;
  for (let i = 0; i < ticks; i++) position = stepMovement(position, intent, TICK_SECONDS);
  return position;
}

test('за один тик по прямой проходим скорость × время', () => {
  const next = stepMovement(start, { dx: 1, dy: 0 }, TICK_SECONDS);
  assert.equal(next.x, start.x + PLAYER_SPEED * TICK_SECONDS);
  assert.equal(next.y, start.y);
});

test('по диагонали не быстрее, чем по прямой', () => {
  const next = stepMovement(start, { dx: 1, dy: 1 }, TICK_SECONDS);
  const distance = Math.hypot(next.x - start.x, next.y - start.y);
  assert.ok(Math.abs(distance - PLAYER_SPEED * TICK_SECONDS) < 0.02, `прошли ${distance}`);
});

test('сквозь дверь гильдии не пройти: встаём вплотную', () => {
  // От площади идём строго вверх: над нами дорога, а дальше дверь гильдии (ряд 8).
  const end = walk(start, { dx: 0, dy: -1 }, 200);
  assert.equal(end.x, start.x);
  assert.equal(end.y, 9 * TILE_SIZE + FEET_HEIGHT);
  assert.equal(feetCollide(end.x, end.y), false);
});

test('у стены скользим вдоль неё, а не застреваем', () => {
  const atWall = walk(start, { dx: 0, dy: -1 }, 200);
  const slid = walk(atWall, { dx: 1, dy: -1 }, 10);
  assert.ok(slid.x > atWall.x, 'вдоль стены не сдвинулись');
  assert.equal(slid.y, atWall.y);
});

test('один и тот же ввод даёт один и тот же результат', () => {
  const route: MoveIntent[] = [
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: -1, dy: -1 },
  ];
  const run = () => route.reduce((position, intent) => walk(position, intent, 15), start);
  assert.deepEqual(run(), run());
});

test('мусорный ввод превращается в −1, 0 или 1', () => {
  const next = stepMovement(start, { dx: 1000, dy: 0 }, TICK_SECONDS);
  assert.equal(next.x, start.x + PLAYER_SPEED * TICK_SECONDS);
});

test('направление взгляда по углу прицела', () => {
  assert.equal(facingFromAngle(0), FACING_RIGHT);
  assert.equal(facingFromAngle(Math.PI / 2), FACING_DOWN);
  assert.equal(facingFromAngle(Math.PI), FACING_LEFT);
  assert.equal(facingFromAngle(-Math.PI / 2), FACING_UP);
  assert.equal(facingFromAngle(2 * Math.PI), FACING_RIGHT);
});
