import { FEET_HEIGHT, FEET_WIDTH, PLAYER_SPEED, TILE_SIZE } from './constants';
import { isSolidTile } from './map';

/**
 * Движение персонажа. Этот файл исполняют И сервер, И клиент:
 * клиент — чтобы сразу показать твой шаг (предсказание),
 * сервер — чтобы решить, где ты на самом деле. Код один, поэтому ответы совпадают.
 */

export interface Point {
  x: number;
  y: number;
}

/** Куда игрок жмёт: по каждой оси −1, 0 или 1. */
export interface MoveIntent {
  dx: number;
  dy: number;
}

/** Направление взгляда — это же номер ряда на листе персонажа. */
export type Facing = 0 | 1 | 2 | 3;
export const FACING_DOWN: Facing = 0;
export const FACING_LEFT: Facing = 1;
export const FACING_RIGHT: Facing = 2;
export const FACING_UP: Facing = 3;

/** Крошечный зазор, чтобы стоящий вплотную к стене не считался стоящим в стене. */
const EDGE = 0.001;

/** Упираются ли ноги персонажа, стоящего в точке (x, y), во что-нибудь твёрдое. */
export function feetCollide(x: number, y: number): boolean {
  const left = x - FEET_WIDTH / 2;
  const right = x + FEET_WIDTH / 2;
  const top = y - FEET_HEIGHT;
  const firstCol = Math.floor(left / TILE_SIZE);
  const lastCol = Math.floor((right - EDGE) / TILE_SIZE);
  const firstRow = Math.floor(top / TILE_SIZE);
  const lastRow = Math.floor((y - EDGE) / TILE_SIZE);
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      if (isSolidTile(col, row)) return true;
    }
  }
  return false;
}

/** Приводит число к −1, 0 или 1. */
export function toAxis(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/** Округление до сотых: так позиции короче в сети и одинаковы на сервере и клиенте. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Один шаг персонажа длиной dtSeconds.
 * Двигаем сначала по X, потом по Y: так у стены персонаж скользит вдоль неё, а не застревает.
 */
export function stepMovement(position: Point, intent: MoveIntent, dtSeconds: number): Point {
  const dx = toAxis(intent.dx);
  const dy = toAxis(intent.dy);
  let distance = PLAYER_SPEED * dtSeconds;
  // По диагонали без этой поправки персонаж бегал бы в 1,41 раза быстрее.
  if (dx !== 0 && dy !== 0) distance *= Math.SQRT1_2;

  const x = moveX(position.x, position.y, dx * distance);
  const y = moveY(x, position.y, dy * distance);
  return { x: round2(x), y: round2(y) };
}

function moveX(x: number, y: number, delta: number): number {
  if (delta === 0) return x;
  const target = x + delta;
  if (!feetCollide(target, y)) return target;
  // Упёрлись — встаём вплотную к стене.
  if (delta > 0) {
    const wallCol = Math.floor((target + FEET_WIDTH / 2 - EDGE) / TILE_SIZE);
    return Math.max(x, wallCol * TILE_SIZE - FEET_WIDTH / 2);
  }
  const wallCol = Math.floor((target - FEET_WIDTH / 2) / TILE_SIZE);
  return Math.min(x, (wallCol + 1) * TILE_SIZE + FEET_WIDTH / 2);
}

function moveY(x: number, y: number, delta: number): number {
  if (delta === 0) return y;
  const target = y + delta;
  if (!feetCollide(x, target)) return target;
  if (delta > 0) {
    const wallRow = Math.floor((target - EDGE) / TILE_SIZE);
    return Math.max(y, wallRow * TILE_SIZE);
  }
  const wallRow = Math.floor((target - FEET_HEIGHT) / TILE_SIZE);
  return Math.min(y, (wallRow + 1) * TILE_SIZE + FEET_HEIGHT);
}

/** Приводит угол к промежутку от −π до π. */
export function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Куда смотрит персонаж, если целится под углом angle.
 * Угол 0 — вправо, π/2 — вниз (на экране ось Y смотрит вниз).
 */
export function facingFromAngle(angle: number): Facing {
  const a = normalizeAngle(angle);
  const quarter = Math.PI / 4;
  if (a >= -quarter && a < quarter) return FACING_RIGHT;
  if (a >= quarter && a < 3 * quarter) return FACING_DOWN;
  if (a >= -3 * quarter && a < -quarter) return FACING_UP;
  return FACING_LEFT;
}
