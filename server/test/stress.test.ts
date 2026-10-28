import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PLAYER_SPEED, TICK_MS, TICK_SECONDS, stepMovement } from '@game/shared';
import { startServer, type RunningServer } from '../src/server';
import { Bot, sleep } from './bot';

/**
 * Проверки на прочность: читеры, плохая сеть, спам, толпа, мёртвые соединения.
 * Сервер здесь проверяет «живость» соединений часто (раз в 200 мс), чтобы тест про призраков шёл быстро.
 */
const HEARTBEAT_MS = 200;
const STEP = PLAYER_SPEED * TICK_SECONDS;

let server: RunningServer;

before(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', heartbeatMs: HEARTBEAT_MS });
});

after(async () => {
  await server.close();
});

function positionOf(bot: Bot, id: number) {
  const player = bot.lastSnap()?.players.find((p) => p.id === id);
  assert.ok(player, 'игрока нет в снимке');
  return player;
}

test('читер шлёт 100 нажатий разом — быстрее не бежит', async () => {
  const cheater = await Bot.connect(server.port);
  const welcome = await cheater.join('Читер');
  await sleep(500); // постоял — накопил наибольший запас движения
  const start = positionOf(cheater, welcome.id).x;
  for (let seq = 1; seq <= 100; seq++) cheater.send({ t: 'input', seq, dx: 1, dy: 0, aim: 0 });
  await sleep(1500);
  const moved = positionOf(cheater, welcome.id).x - start;
  // Очередь держит не больше 20 нажатий — значит, максимум 20 честных шагов.
  assert.ok(moved <= 20 * STEP + 0.01, `читер прошёл ${moved} px`);
  await cheater.close();
});

test('рваная сеть: по 3 нажатия раз в 150 мс — всё учтено, позиция точная', async () => {
  const bot = await Bot.connect(server.port);
  const welcome = await bot.join('Рваный');
  let expected = { x: welcome.you.x, y: welcome.you.y };
  let seq = 0;
  for (let burst = 0; burst < 10; burst++) {
    const dx = burst % 2 === 0 ? 1 : 0;
    const dy = burst % 2 === 0 ? 0 : 1;
    for (let k = 0; k < 3; k++) {
      bot.send({ t: 'input', seq: ++seq, dx, dy, aim: 0 });
      expected = stepMovement(expected, { dx, dy }, TICK_SECONDS);
    }
    await sleep(150);
  }
  await bot.waitFor('snap', (m) => m.ack === 30);
  await sleep(TICK_MS * 2);
  const final = positionOf(bot, welcome.id);
  assert.deepEqual({ x: final.x, y: final.y }, expected);
  await bot.close();
});

test('спам в чат режется, поток мусора не останавливает мир', async () => {
  const spammer = await Bot.connect(server.port);
  await spammer.join('Спамер');
  const listener = await Bot.connect(server.port);
  await listener.join('Слушатель');
  const snapsBefore = listener.count('snap');

  for (let i = 0; i < 10; i++) spammer.send({ t: 'chat', text: `спам ${i}` });
  for (let i = 0; i < 3000; i++) spammer.send('{"t":"мусор"}');
  await sleep(600);

  assert.ok(listener.count('chat') <= 2, `дошло ${listener.count('chat')} сообщений спама`);
  await spammer.waitFor('system', (m) => m.text.includes('Не так быстро'));
  assert.ok(listener.count('snap') - snapsBefore > 5, 'мир перестал присылать снимки');
  await Promise.all([spammer.close(), listener.close()]);
});

test('стоящий игрок не двигается и не «идёт»', async () => {
  const bot = await Bot.connect(server.port);
  const welcome = await bot.join('Столб');
  await sleep(400);
  const me = positionOf(bot, welcome.id);
  assert.deepEqual({ x: me.x, y: me.y }, { x: welcome.you.x, y: welcome.you.y });
  assert.equal(me.moving, false);
  await bot.close();
});

test('45 игроков бегают одновременно — мир всё так же 20 раз в секунду', async () => {
  const bots: Bot[] = [];
  for (let i = 0; i < 45; i++) {
    const bot = await Bot.connect(server.port);
    await bot.join(`Бот${i}`);
    bots.push(bot);
  }
  let seq = 0;
  const timer = setInterval(() => {
    seq++;
    for (const [i, bot] of bots.entries()) bot.send({ t: 'input', seq, dx: (i % 3) - 1, dy: 1, aim: 0 });
  }, TICK_MS);
  const before = bots[0]!.count('snap');
  const started = performance.now();
  await sleep(2000);
  clearInterval(timer);
  const rate = (bots[0]!.count('snap') - before) / ((performance.now() - started) / 1000);
  assert.ok(rate > 17, `снимков в секунду: ${rate.toFixed(1)}`);
  await Promise.all(bots.map((bot) => bot.close()));
});

test('мёртвое соединение выкидывается, а имя освобождается', async () => {
  // Призрак не отвечает на проверки сервера — как будто у него выдернули Wi-Fi.
  const ghost = await Bot.connect(server.port, { autoPong: false });
  const ghostWelcome = await ghost.join('Призрак');
  const watcher = await Bot.connect(server.port);
  await watcher.join('Сторож');

  await watcher.waitFor('left', (m) => m.id === ghostWelcome.id, HEARTBEAT_MS * 6);

  const returned = await Bot.connect(server.port);
  const again = await returned.join('Призрак');
  assert.notEqual(again.id, ghostWelcome.id);
  await Promise.all([ghost.close(), watcher.close(), returned.close()]);
});
