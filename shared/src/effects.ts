import { DEGRADATION_THRESHOLDS } from './constants';

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
 *   90 и 100 — всего больше и чаще, мир почти неузнаваем.
 */
export type Effect = 'blot' | 'vignette' | 'glimpse' | 'cracks' | 'colors' | 'names';

/** С какой деградации (%) включается помеха. */
export const EFFECT_FROM: Readonly<Record<Effect, number>> = {
  blot: 35,
  vignette: 40,
  glimpse: 50,
  cracks: 60,
  colors: 70,
  names: 80,
};

/**
 * Сила помехи при таком номере порога: 0 — выключена, 1 — только включилась, дальше растёт
 * на каждом следующем пороге. Клиент по ней решает, насколько густо и часто рисовать.
 */
export function effectStrength(effect: Effect, band: number): number {
  const from = thresholdIndex(EFFECT_FROM[effect]);
  return band >= from ? band - from + 1 : 0;
}
