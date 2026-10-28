import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEGRADATION_MAX,
  DEGRADATION_MEMORY_MS,
  DEGRADATION_MIN,
  RELIEF_FADE_PER_SECOND,
  TICK_RATE,
  type ServerMessage,
} from '@game/shared';
import { Degradation } from '../src/degradation';
import { World } from '../src/world';

/** Мир с ручными часами: время двигаем сами, ждать по-настоящему не надо. */
function makeWorld() {
  const clock = { now: 0 };
  const world = new World(() => clock.now, () => 0);
  const sent: ServerMessage[] = [];
  const join = (name: string) => {
    const result = world.join({ send: (message) => sent.push(message) }, name);
    assert.ok(result.ok, 'не пустили в мир');
    return result.id;
  };
  return { world, clock, sent, join };
}

test('деградация не выходит за пределы −20…100', () => {
  const d = new Degradation();
  d.grow(500);
  assert.equal(d.actual, DEGRADATION_MAX);
  d.study(500);
  assert.equal(d.actual, DEGRADATION_MIN);
  assert.equal(new Degradation(-70).actual, DEGRADATION_MIN);
});

test('зелье опускает текущую, а истинную не трогает, и со временем выветривается', () => {
  const d = new Degradation(40);
  d.drink(15);
  assert.equal(d.actual, 40);
  assert.equal(d.current, 25);
  d.fade(15 / RELIEF_FADE_PER_SECOND / 2);
  assert.ok(Math.abs(d.current - 32.5) < 0.001, `текущая ${d.current}`);
  d.fade(1000);
  assert.equal(d.current, 40);
});

test('зелье не уводит ниже нуля — туда только учёбой', () => {
  const d = new Degradation(10);
  d.drink(50);
  assert.equal(d.current, 0);
  d.study(25);
  assert.equal(d.current, -15);
});

test('стоишь на месте — деградация не растёт', () => {
  const { world, join } = makeWorld();
  const id = join('Стоялец');
  world.degradationOf(id)!.grow(30);
  for (let i = 0; i < TICK_RATE * 60; i++) world.step();
  assert.equal(world.degradationOf(id)!.actual, 30);
});

test('вышел и зашёл под тем же именем — деградация та же, зелье за это время выветрилось', () => {
  const { world, clock, join } = makeWorld();
  const first = join('Фима');
  world.degradationOf(first)!.grow(42);
  world.degradationOf(first)!.drink(10);
  world.leave(first);

  clock.now += 60 * 1000;
  const again = join('фИМА');
  const d = world.degradationOf(again)!;
  assert.equal(d.actual, 42);
  assert.ok(Math.abs(d.current - (32 + RELIEF_FADE_PER_SECOND * 60)) < 0.001, `текущая ${d.current}`);
});

test('через 30 минут сервер забывает ушедшего', () => {
  const { world, clock, join } = makeWorld();
  const first = join('Забытый');
  world.degradationOf(first)!.grow(60);
  world.leave(first);

  clock.now += DEGRADATION_MEMORY_MS;
  const again = join('Забытый');
  assert.equal(world.degradationOf(again)!.actual, 0);
});

test('настоящая деградация не уходит клиенту', () => {
  const { world, sent, join } = makeWorld();
  const id = join('Скрытный');
  join('Сосед');
  world.degradationOf(id)!.grow(37.25);
  for (let i = 0; i < 10; i++) world.step();
  world.chat(id, 'привет');
  const everything = JSON.stringify(sent);
  assert.ok(!everything.includes('37.25'), 'число деградации попало в сообщения');
  assert.ok(!/degradation|relief|truth/i.test(everything), 'поле деградации попало в сообщения');
});
