import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { TICK_MS, TICK_SECONDS, stepMovement } from '@game/shared';
import { startServer, type RunningServer } from '../src/server';
import { Bot, sleep } from './bot';

let server: RunningServer;

before(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1' });
});

after(async () => {
  await server.close();
});

test('двое заходят, видят друг друга, ходят, болтают и уходят', async () => {
  const a = await Bot.connect(server.port);
  const welcomeA = await a.join('Фима');
  assert.equal(welcomeA.you.id, welcomeA.id);

  const b = await Bot.connect(server.port);
  const welcomeB = await b.join('Друг');
  assert.deepEqual(welcomeB.players.map((p) => p.name).sort(), ['Друг', 'Фима']);
  await a.waitFor('joined', (m) => m.player.name === 'Друг');

  // Фима делает 10 шагов вправо — по одному нажатию на тик, как настоящий клиент.
  let expected = { x: welcomeA.you.x, y: welcomeA.you.y };
  for (let seq = 1; seq <= 10; seq++) {
    a.send({ t: 'input', seq, dx: 1, dy: 0, aim: 0 });
    expected = stepMovement(expected, { dx: 1, dy: 0 }, TICK_SECONDS);
    await sleep(TICK_MS);
  }

  // Сервер учёл все 10 нажатий, и Фима стоит ровно там, где предсказал бы клиент.
  const ackSnap = await a.waitFor('snap', (m) => m.ack === 10);
  const fimaForA = ackSnap.players.find((p) => p.id === welcomeA.id)!;
  assert.deepEqual({ x: fimaForA.x, y: fimaForA.y }, expected);

  // Друг видит, что Фима ушёл вправо.
  await b.waitFor('snap', (m) => m.players.some((p) => p.id === welcomeA.id && p.x === expected.x));

  a.send({ t: 'chat', text: '  привет,   мир  ' });
  const said = await b.waitFor('chat');
  assert.equal(said.name, 'Фима');
  assert.equal(said.text, 'привет, мир');

  await a.close();
  await b.waitFor('left', (m) => m.id === welcomeA.id);
  await b.close();
});

test('занятое и плохое имя не пускают', async () => {
  const a = await Bot.connect(server.port);
  await a.join('Гоша');

  const twin = await Bot.connect(server.port);
  twin.send({ t: 'join', name: 'гоша' });
  const taken = await twin.waitFor('error');
  assert.match(taken.message, /имя/i);

  const shorty = await Bot.connect(server.port);
  shorty.send({ t: 'join', name: 'x' });
  const short = await shorty.waitFor('error');
  assert.match(short.message, /коротк/);

  await Promise.all([a.close(), twin.close(), shorty.close()]);
});

test('мусор от клиента сервер не роняет', async () => {
  const bot = await Bot.connect(server.port);
  bot.send('это не JSON');
  bot.send({ t: 'input', seq: 'раз', dx: 1, dy: 0, aim: 0 });
  bot.send({ t: 'chat', text: 'чат до входа' });
  bot.send({ t: 'взлом' });
  bot.send({ t: 'answer', choice: 'два' });
  bot.send({ t: 'answer', choice: -1 });
  const welcome = await bot.join('Хитрец');
  assert.equal(typeof welcome.id, 'number');
  await bot.close();
});

test('E и отладочная команда доходят через сеть', async () => {
  const bot = await Bot.connect(server.port);
  const welcome = await bot.join('Тыкалка');
  assert.ok(Array.isArray(welcome.picked));

  bot.send({ t: 'use' });
  await bot.waitFor('system', (m) => m.text === 'Рядом нечего собрать.');
  bot.send({ t: 'answer', choice: 1 }); // книги не открыто — сервер просто промолчит

  // Бот подключён с 127.0.0.1 — это «тот же компьютер», ему отладка можно.
  bot.send({ t: 'chat', text: '/дег 12' });
  await bot.waitFor('system', (m) => m.text.startsWith('Отладка: истинная 12 %'));
  assert.equal(bot.count('chat'), 0, 'команда не должна уходить в чат');
  await bot.close();
});

test('снимки мира приходят примерно 20 раз в секунду', async () => {
  const bot = await Bot.connect(server.port);
  await bot.join('Счётчик');
  const before = bot.count('snap');
  await sleep(1000);
  const count = bot.count('snap') - before;
  assert.ok(count >= 17 && count <= 23, `пришло ${count} снимков`);
  await bot.close();
});
