import { RESOURCE_RULES, type ResourceKind, type ResourceSpot } from '@game/shared';

/**
 * Кусты и камни деревни: какие сейчас пустые и когда отрастут. Шахта не кончается — её тут не бывает.
 * Состояние общее на всех: сорвал ягоды один — куст пустой для всех.
 */
export class ResourceField {
  /** Номер места → когда отрастёт (мс). */
  private readonly regrowAt = new Map<number, number>();

  /** Номера пустых мест — для новичка в мире. */
  get picked(): number[] {
    return [...this.regrowAt.keys()];
  }

  isPicked(id: number): boolean {
    return this.regrowAt.has(id);
  }

  /** Место собрали в момент now. Возвращает true, если оно опустело (шахта не пустеет). */
  pick(spot: ResourceSpot, now: number): boolean {
    const rule = RESOURCE_RULES[spot.kind];
    if (rule.pickedTile === null) return false;
    this.regrowAt.set(spot.id, now + rule.regrowMs);
    return true;
  }

  /** Отращивает всё, чему пора. Возвращает номера отросших мест. */
  regrow(now: number): number[] {
    const grown: number[] = [];
    for (const [id, at] of this.regrowAt) {
      if (now >= at) {
        this.regrowAt.delete(id);
        grown.push(id);
      }
    }
    return grown;
  }
}

/**
 * Что пишет игра после сбора. Чисел не показываем, но приедание слышно:
 * чем дольше долбишь одно и то же, тем пустее фразы. Тексты — черновик, Фима правит.
 */
const GATHER_TEXTS: Record<ResourceKind, readonly [string, string, string]> = {
  bush: ['Ты нарвал ягод.', 'Опять ягоды.', 'Руки рвут ягоды сами. В голове пусто.'],
  stone: ['Ты отколол кусок камня.', 'Опять камень.', 'Бьёшь камень и ни о чём не думаешь.'],
  mine: ['Ты долбишь породу.', 'Долбишь дальше.', 'Тук. Тук. Тук. Ты и есть кирка.'],
};

const EMPTY_TEXTS: Record<ResourceKind, string> = {
  bush: 'Куст пустой: ягоды ещё не отросли.',
  stone: 'От камня уже всё отколото. Подожди.',
  mine: '',
};

/** Фраза после сбора: обычная, «опять» (×1,75 и выше) или пустая (×2,75 и выше). */
export function gatherText(kind: ResourceKind, multiplier: number): string {
  const texts = GATHER_TEXTS[kind];
  if (multiplier >= 2.75) return texts[2];
  if (multiplier >= 1.75) return texts[1];
  return texts[0];
}

export function emptyText(kind: ResourceKind): string {
  return EMPTY_TEXTS[kind];
}

export const NOTHING_TO_GATHER = 'Рядом нечего собрать.';
