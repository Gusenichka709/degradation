import { DEGRADATION_THRESHOLDS } from '@game/shared';

/** Номер порога: 0 — ниже 25 %, 1 — от 25 %, 2 — от 30 % … 11 — 100 %. Клиент знает только его. */
export function thresholdIndex(value: number): number {
  let index = 0;
  for (const threshold of DEGRADATION_THRESHOLDS) if (value >= threshold) index++;
  return index;
}

/** Порог, с которого шкалы нет совсем (50 %). */
const HIDDEN_FROM = thresholdIndex(50);
/** Шкала, которая врёт, никогда не показывает 50 и больше. */
const MAX_SHOWN = 49;

/** Что видит игрок: номер порога и число на шкале. null — шкалы сейчас нет. */
export interface ScaleView {
  band: number;
  shown: number | null;
}

/** Состояние шкалы: что показываем и до какого момента (мс). */
interface Frame {
  shown: number | null;
  until: number;
}

/**
 * Шкала деградации, которая врёт. Сервер сам решает, какое число показать, и шлёт только его —
 * настоящее число клиенту не уходит. Черновик лесенки (Фима правит):
 *   до 25 — честная;
 *   25 — дрожит, ошибка до 2 %;
 *   30 — то же, и иногда мигает левым числом;
 *   35 — ошибка до 6 %, иногда залипает на старом числе;
 *   40 — то пропадает, то появляется;
 *   45 — появляется изредка на пару секунд и почти всегда врёт;
 *   50 и выше — шкалы нет.
 */
export class LyingScale {
  private band = -1;
  private frame: Frame = { shown: null, until: 0 };

  constructor(private readonly random: () => number = Math.random) {}

  /** Деградация сейчас current, время now (мс). Возвращает, что показать. */
  update(current: number, now: number): ScaleView {
    const band = thresholdIndex(current);
    if (band !== this.band || now >= this.frame.until) {
      this.frame = this.next(band, current, now, band !== this.band);
      this.band = band;
    }
    return { band, shown: this.frame.shown };
  }

  /** Следующее состояние шкалы. bandChanged — только что перешли порог. */
  private next(band: number, current: number, now: number, bandChanged: boolean): Frame {
    const visible = this.frame.shown !== null && !bandChanged;
    const between = (from: number, to: number) => from + this.random() * (to - from);
    const chance = (p: number) => this.random() < p;
    const near = (error: number) => clamp(Math.round(current + between(-error, error)));
    const lie = () => Math.floor(between(0, MAX_SHOWN + 1));

    if (band === 0) return { shown: Math.round(current), until: 0 };
    if (band >= HIDDEN_FROM) return { shown: null, until: Infinity };
    switch (band) {
      case 1:
        return { shown: near(2), until: now + 1000 };
      case 2:
        return chance(0.15) ? { shown: lie(), until: now + 500 } : { shown: near(2), until: now + 1000 };
      case 3:
        if (visible && chance(0.2)) return { shown: this.frame.shown, until: now + between(3000, 5000) };
        return { shown: near(6), until: now + 1000 };
      case 4:
        if (visible) return { shown: null, until: now + between(3000, 8000) };
        return { shown: chance(0.3) ? lie() : near(6), until: now + between(2000, 5000) };
      default:
        if (visible) return { shown: null, until: now + between(30_000, 60_000) };
        return { shown: chance(0.8) ? lie() : near(6), until: now + 2000 };
    }
  }
}

function clamp(value: number): number {
  return Math.min(MAX_SHOWN, Math.max(0, value));
}
