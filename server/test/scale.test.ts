import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_MS, thresholdIndex, type ServerMessage } from '@game/shared';
import { LyingScale } from '../src/scale';
import { World } from '../src/world';

/** Случайные числа, одинаковые от запуска к запуску: тест не мигает. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Гоняет шкалу при деградации value минуты minutes, раз в тик. Возвращает всё, что она показала. */
function watch(value: number, minutes: number, seed = 1): (number | null)[] {
  const scale = new LyingScale(seeded(seed));
  const seen: (number | null)[] = [];
  for (let now = 0; now < minutes * 60 * 1000; now += TICK_MS) seen.push(scale.update(value, now).shown);
  return seen;
}

test('номер порога: 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100', () => {
  assert.equal(thresholdIndex(-20), 0);
  assert.equal(thresholdIndex(24.9), 0);
  assert.equal(thresholdIndex(25), 1);
  assert.equal(thresholdIndex(44.9), 4);
  assert.equal(thresholdIndex(50), 6);
  assert.equal(thresholdIndex(69), 7);
  assert.equal(thresholdIndex(100), 11);
});

test('до 25 % шкала честная и всегда на месте', () => {
  for (const value of [-12, 0, 7, 24]) {
    assert.ok(watch(value, 1).every((shown) => shown === value), `при ${value} % шкала соврала`);
  }
});

test('с 50 % шкалы нет совсем', () => {
  for (const value of [50, 63, 100]) assert.ok(watch(value, 5).every((shown) => shown === null));
});

test('на 25 % шкала дрожит, но врёт не больше чем на 2 %', () => {
  const seen = watch(27, 5);
  assert.ok(seen.every((shown) => shown !== null && Math.abs(shown - 27) <= 2));
  assert.ok(new Set(seen).size > 1, 'шкала должна дрожать');
});

test('на 30 % иногда мигает левым числом', () => {
  const seen = watch(32, 5);
  assert.ok(seen.some((shown) => shown !== null && Math.abs(shown - 32) > 2), 'ни разу не соврала');
  assert.ok(seen.every((shown) => shown !== null));
});

test('на 40 % то пропадает, то появляется', () => {
  const seen = watch(42, 5);
  const hidden = seen.filter((shown) => shown === null).length / seen.length;
  assert.ok(hidden > 0.3 && hidden < 0.9, `пропадает ${Math.round(hidden * 100)} % времени`);
});

test('на 45 % появляется изредка и никогда не показывает 50 и больше', () => {
  const seen = watch(48, 20);
  const visible = seen.filter((shown) => shown !== null).length / seen.length;
  assert.ok(visible > 0 && visible < 0.15, `видна ${Math.round(visible * 100)} % времени`);
  assert.ok(seen.every((shown) => shown === null || (shown >= 0 && shown <= 49)));
});

test('сервер шлёт шкалу при входе и когда она меняется, а выше 50 % — пустую', () => {
  const clock = { now: 10_000 };
  const world = new World(() => clock.now, () => 0);
  const sent: ServerMessage[] = [];
  const result = world.join({ send: (message) => sent.push(message) }, 'Шкальник', { local: true });
  assert.ok(result.ok);
  const scales = () => sent.filter((m) => m.t === 'scale');
  assert.deepEqual(scales().at(-1), { t: 'scale', band: 0, shown: 0 });

  // Стоим — шкала та же, лишнего не шлём.
  for (let i = 0; i < 20; i++) world.step();
  assert.equal(scales().length, 1);

  world.chat(result.id, '/дег 60');
  world.step();
  assert.deepEqual(scales().at(-1), { t: 'scale', band: 7, shown: null });
});
