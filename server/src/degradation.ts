import {
  DEGRADATION_MAX,
  DEGRADATION_MEMORY_MS,
  DEGRADATION_MIN,
  HABIT_MAX,
  HABIT_RESET_MS,
  HABIT_STEP,
  RELIEF_FADE_PER_SECOND,
} from '@game/shared';

function clampDegradation(value: number): number {
  return Math.min(DEGRADATION_MAX, Math.max(DEGRADATION_MIN, value));
}

/**
 * Деградация одного персонажа. Живёт только на сервере: настоящие числа клиенту не уходят никогда.
 *
 * Истинная — где персонаж на самом деле. Опускают её только школа и библиотека.
 * Облегчение — временный сдвиг от зелий, сам выветривается со временем.
 * Текущая = истинная − облегчение. По ней считаются шкала, помехи и искажения.
 */
export class Degradation {
  private truth: number;
  private relief = 0;

  constructor(initial = 0) {
    this.truth = clampDegradation(initial);
  }

  /** Истинная деградация, %. */
  get actual(): number {
    return this.truth;
  }

  /**
   * Текущая деградация, %. Зелье не уводит ниже нуля — туда только учёбой,
   * поэтому облегчение действует не больше, чем на истинную деградацию выше нуля.
   */
  get current(): number {
    return this.truth - Math.min(this.relief, Math.max(this.truth, 0));
  }

  /** Персонаж что-то сделал: деградация растёт. */
  grow(amount: number): void {
    if (amount > 0) this.truth = clampDegradation(this.truth + amount);
  }

  /** Учёба (школа, библиотека): опускает истинную деградацию надолго. */
  study(amount: number): void {
    if (amount > 0) this.truth = clampDegradation(this.truth - amount);
  }

  /** Зелье: опускает текущую деградацию на время. Несколько зелий складываются. */
  drink(amount: number): void {
    if (amount > 0) this.relief = Math.min(this.relief + amount, DEGRADATION_MAX);
  }

  /** Прошло столько-то секунд: действие зелий слабеет. */
  fade(seconds: number): void {
    if (this.relief > 0) this.relief = Math.max(0, this.relief - RELIEF_FADE_PER_SECOND * seconds);
  }

  /** Только для отладки (/дег): ставит истинную деградацию и снимает действие зелий. */
  set(value: number): void {
    this.truth = clampDegradation(value);
    this.relief = 0;
  }
}

/**
 * Приедание: одно и то же подряд тупит всё сильнее. Каждый сбор того же вида подряд прибавляет
 * к множителю прироста HABIT_STEP, до HABIT_MAX. Другой вид или перерыв дольше HABIT_RESET_MS —
 * и снова ×1.
 */
export class Habit {
  private kind: string | null = null;
  private streak = 0;
  private lastAt = 0;

  /** Персонаж снова что-то сделал (вид kind, время now в мс). Возвращает множитель прироста. */
  repeat(kind: string, now: number): number {
    if (kind !== this.kind || now - this.lastAt > HABIT_RESET_MS) {
      this.kind = kind;
      this.streak = 0;
    }
    this.streak++;
    this.lastAt = now;
    return this.multiplier;
  }

  /** Множитель последнего дела: ×1 на первом, дальше растёт. */
  get multiplier(): number {
    return Math.min(HABIT_MAX, 1 + HABIT_STEP * Math.max(0, this.streak - 1));
  }

  /** Сколько раз подряд одно и то же. */
  get count(): number {
    return this.streak;
  }
}

/**
 * Где сервер помнит деградацию вышедших игроков, пока нет аккаунтов (этап 5).
 * Ключ — имя без учёта регистра. Через 30 минут запись забывается.
 */
export class DegradationMemory {
  private readonly saved = new Map<string, { degradation: Degradation; at: number }>();

  constructor(private readonly now: () => number) {}

  get size(): number {
    return this.saved.size;
  }

  save(name: string, degradation: Degradation): void {
    this.forgetOld();
    this.saved.set(name.toLowerCase(), { degradation, at: this.now() });
  }

  /** Достаёт деградацию по имени (и стирает запись). Не помним — начинаем с нуля. */
  take(name: string): Degradation {
    this.forgetOld();
    const key = name.toLowerCase();
    const entry = this.saved.get(key);
    if (!entry) return new Degradation();
    this.saved.delete(key);
    // Пока игрока не было, зелье продолжало выветриваться.
    entry.degradation.fade((this.now() - entry.at) / 1000);
    return entry.degradation;
  }

  private forgetOld(): void {
    const now = this.now();
    for (const [key, entry] of this.saved) {
      if (now - entry.at >= DEGRADATION_MEMORY_MS) this.saved.delete(key);
    }
  }
}
