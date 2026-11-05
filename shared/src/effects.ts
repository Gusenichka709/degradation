import { DEGRADATION_THRESHOLDS, EFFECT_MAX_STRENGTH } from './constants';

/** Номер порога: 0 — ниже 25 %, 1 — от 25 %, 2 — от 30 % … 11 — 100 %. Клиент знает только его. */
export function thresholdIndex(value: number): number {
  let index = 0;
  for (const threshold of DEGRADATION_THRESHOLDS) if (value >= threshold) index++;
  return index;
}

/**
 * Помехи, которые рисует клиент. Сервер присылает только номер порога, клиент смотрит сюда,
 * что включить. Черновик (Фима правит):
 *   35 — клякса-морок ползает по экрану;
 *   40 — края экрана темнеют;
 *   50 — «краем глаза»: силуэт на долю секунды у края экрана;
 *   60 — трещины по углам;
 *   70 — цвета мира плывут;
 *   80 — имена над головами коверкаются;
 *   90 — врёт интерфейс: подсказки коверкаются;
 *   100 — на долю секунды проступает истинный облик мира: ведьминские знаки на стенах.
 *   Каждая помеха усиливается только на следующем пороге после своего, дальше не растёт.
 *   Особые эффекты потом дадут зоны: особые места и логово босса, в зависимости от деградации.
 */
export type Effect = 'blot' | 'vignette' | 'glimpse' | 'cracks' | 'colors' | 'names' | 'interface' | 'truth';

/** С какой деградации (%) включается помеха. */
export const EFFECT_FROM: Readonly<Record<Effect, number>> = {
  blot: 35,
  vignette: 40,
  glimpse: 50,
  cracks: 60,
  colors: 70,
  names: 80,
  interface: 90,
  truth: 100,
};

/**
 * Сила помехи при таком номере порога: 0 — выключена, 1 — только включилась, 2 — со следующего порога
 * и дальше (не больше EFFECT_MAX_STRENGTH). Клиент по ней решает, насколько густо и часто рисовать.
 */
export function effectStrength(effect: Effect, band: number): number {
  const from = thresholdIndex(EFFECT_FROM[effect]);
  return band >= from ? Math.min(EFFECT_MAX_STRENGTH, band - from + 1) : 0;
}
