import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUSH_GROWTH,
  BUSH_REGROW_MS,
  HABIT_MAX,
  HABIT_RESET_MS,
  MINE_COOLDOWN_MS,
  MINE_GROWTH,
  RESOURCE_SPOTS,
  TILE_SIZE,
} from '@game/shared';
import { Habit } from '../src/degradation';
import { makeWorld, walk } from './helpers';

function spotAt(col: number, row: number) {
  const spot = RESOURCE_SPOTS.find((s) => s.col === col && s.row === row);
  assert.ok(spot, `на карте нет места сбора в ${col}, ${row}`);
  return spot;
}

test('приедание: одно и то же подряд тупит сильнее, другое дело или перерыв — снова ×1', () => {
  const habit = new Habit();
  const row = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => habit.repeat('bush', i * 1000));
  assert.deepEqual(row, [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3]);
  assert.equal(habit.multiplier, HABIT_MAX);

  assert.equal(habit.repeat('stone', 11_000), 1, 'другой вид должен сбросить множитель');
  assert.equal(habit.repeat('stone', 12_000), 1.25);
  assert.equal(habit.repeat('stone', 12_000 + HABIT_RESET_MS + 1), 1, 'минута перерыва должна сбросить множитель');
  habit.repeat('stone', 80_000);
  habit.reset();
  assert.equal(habit.repeat('stone', 81_000), 1, 'чтение в библиотеке должно сбросить множитель');
});

test('сорвал ягоды — деградация выросла, куст опустел для всех и через минуту отрос', () => {
  const { world, clock, inbox, join, said } = makeWorld();
  const id = join('Сборщик');
  const neighbour = join('Сосед');
  const bush = spotAt(28, 13);

  // Встаём под кустом: идём по дороге вправо, потом вверх, пока куст не упрётся в макушку.
  walk(world, id, [bush.col * TILE_SIZE + TILE_SIZE / 2, (bush.row + 1) * TILE_SIZE]);
  world.use(id);
  assert.ok(Math.abs(world.degradationOf(id)!.actual - BUSH_GROWTH) < 0.0001);
  assert.ok(said(id).includes('Ты нарвал ягод.'));
  assert.ok(inbox.get(neighbour)!.some((m) => m.t === 'resource' && m.id === bush.id && m.picked));

  // Пустой куст ничего не даёт.
  clock.now += 5000;
  world.use(id);
  assert.ok(Math.abs(world.degradationOf(id)!.actual - BUSH_GROWTH) < 0.0001);
  assert.ok(said(id).some((text) => text.startsWith('Куст пустой')));

  // Новичок узнаёт, что куст пустой, сразу при входе.
  const late = join('Опоздавший');
  const welcome = inbox.get(late)!.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome' && welcome.picked.includes(bush.id));

  // Через минуту куст отрастает — для всех.
  clock.now += BUSH_REGROW_MS;
  world.step();
  assert.ok(inbox.get(neighbour)!.some((m) => m.t === 'resource' && m.id === bush.id && !m.picked));
  world.use(id);
  assert.ok(world.degradationOf(id)!.actual > BUSH_GROWTH, 'отросший куст должен собираться снова');
});

test('шахта не кончается, бьёшь не чаще раза в 2 секунды, приедание растёт', () => {
  const { world, clock, join, said } = makeWorld();
  const id = join('Шахтёр');
  const mine = spotAt(42, 26);
  walk(world, id, [mine.col * TILE_SIZE + TILE_SIZE / 2, mine.row * TILE_SIZE]);

  const d = world.degradationOf(id)!;
  world.use(id);
  assert.ok(Math.abs(d.actual - MINE_GROWTH) < 0.0001);

  // Слишком рано — удар не засчитан.
  clock.now += MINE_COOLDOWN_MS / 2;
  world.use(id);
  assert.ok(Math.abs(d.actual - MINE_GROWTH) < 0.0001);

  // Девять ударов подряд — множитель дошёл до ×3, шахта не пустеет.
  let expected = MINE_GROWTH;
  for (let i = 2; i <= 9; i++) {
    clock.now += MINE_COOLDOWN_MS;
    world.use(id);
    expected += MINE_GROWTH * Math.min(HABIT_MAX, 1 + 0.25 * (i - 1));
  }
  assert.ok(Math.abs(d.actual - expected) < 0.0001, `деградация ${d.actual}, ждали ${expected}`);
  assert.equal(said(id).at(-1), 'Тук. Тук. Тук. Ты и есть кирка.');
});

test('далеко от кустов и камней E ничего не даёт', () => {
  const { world, join, said } = makeWorld();
  const id = join('Зевака');
  world.use(id);
  assert.equal(world.degradationOf(id)!.actual, 0);
  assert.equal(said(id).at(-1), 'Рядом нечего собрать.');
});

test('/дег работает только с компьютера сервера и в чат не уходит', () => {
  const { world, clock, join, said } = makeWorld();
  const host = join('Фима', true);
  const friend = join('Друг');

  clock.now += 10_000; // чат не пускает сообщения чаще раза в 300 мс — отходим от нуля
  world.chat(host, '/дег 45');
  assert.equal(world.degradationOf(host)!.actual, 45);
  assert.match(said(host).at(-1)!, /^Отладка: истинная 45 %, текущая 45 %/);

  clock.now += 1000;
  world.chat(host, '/дег 12,5');
  assert.equal(world.degradationOf(host)!.actual, 12.5);

  world.chat(friend, '/дег 99');
  assert.equal(world.degradationOf(friend)!.actual, 0);
  assert.match(said(friend).at(-1)!, /только на компьютере/);

  // Ни команды, ни ответы на них другие не видят.
  assert.ok(!said(friend).some((text) => text.includes('Отладка: истинная')));
  assert.ok(!said(host).some((text) => text.includes('/дег')));
});
