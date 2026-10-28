/**
 * Общие числа игры. Сервер и клиент берут их отсюда, поэтому всегда совпадают.
 * Поменял число здесь — оно поменялось везде.
 */

/** Размер одной клетки карты в пикселях. */
export const TILE_SIZE = 32;

/** Сколько раз в секунду сервер пересчитывает мир. */
export const TICK_RATE = 20;
/** Длина одного тика в миллисекундах: 50 мс при 20 тиках в секунду. */
export const TICK_MS = 1000 / TICK_RATE;
/** Длина одного тика в секундах — для формул скорости. */
export const TICK_SECONDS = TICK_MS / 1000;

/** Скорость ходьбы, пикселей в секунду. 110 — это примерно 3,4 клетки. */
export const PLAYER_SPEED = 110;

/**
 * «Ноги» персонажа — прямоугольник, которым он упирается в стены.
 * Точка персонажа (x, y) — середина нижнего края этого прямоугольника, то есть место, где он стоит.
 */
export const FEET_WIDTH = 18;
export const FEET_HEIGHT = 10;

/** Кадр персонажа на листе спрайтов: 32 × 48 пикселей (3 кадра × 4 направления). */
export const HERO_FRAME_WIDTH = 32;
export const HERO_FRAME_HEIGHT = 48;
/** Высота «груди» над ногами: отсюда персонаж целится. */
export const AIM_ORIGIN_OFFSET_Y = 20;

/** На сколько миллисекунд клиент отстаёт с показом чужих игроков, чтобы они двигались плавно. */
export const INTERPOLATION_DELAY_MS = 100;

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;
export const CHAT_MAX_LENGTH = 200;
export const MAX_PLAYERS = 50;

/** Порт игрового сервера. */
export const SERVER_PORT = 2567;
