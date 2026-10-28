import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { TICK_MS, parseClientMessage, type ServerMessage } from '@game/shared';
import { serveStatic } from './static';
import { World, type Outbox } from './world';

export interface ServerOptions {
  port: number;
  /** На каком адресе слушать. Пусто — на всех, тогда в игру можно зайти и с других компьютеров в сети. */
  host?: string;
  /** Папка собранного клиента или null, если его нет. */
  staticDir?: string | null;
  log?: (line: string) => void;
  /** Как часто проверять, живы ли соединения (мс). В тестах ставим поменьше. */
  heartbeatMs?: number;
}

export interface RunningServer {
  port: number;
  world: World;
  close(): Promise<void>;
}

/** Самое большое сообщение от клиента, которое сервер готов прочитать. */
const MAX_MESSAGE_BYTES = 4096;
/**
 * Раз в 5 секунд сервер «пингует» каждое соединение. Браузер отвечает сам, даже из фоновой вкладки.
 * Кто не ответил до следующей проверки — мёртв (отвалился Wi-Fi, уснул ноутбук): выкидываем его,
 * чтобы персонаж-«призрак» не висел в мире и не занимал имя.
 */
const DEFAULT_HEARTBEAT_MS = 5000;

/** Запускает HTTP-сервер (раздаёт страницу) и WebSocket-сервер (сама игра) на одном порту. */
export function startServer(options: ServerOptions): Promise<RunningServer> {
  const log = options.log ?? (() => {});
  const world = new World();
  const http = createServer((req, res) => serveStatic(req, res, options.staticDir ?? null));
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (socket) => {
    let playerId: number | null = null;
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));
    const outbox: Outbox = {
      send(message: ServerMessage) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      },
    };

    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      const message = parseClientMessage(data.toString());
      if (!message) return;

      if (message.t === 'ping') {
        outbox.send({ t: 'pong', c: message.c });
        return;
      }

      // Пока игрок не представился, принимаем только «join».
      if (playerId === null) {
        if (message.t !== 'join') return;
        const result = world.join(outbox, message.name);
        if (result.ok) {
          playerId = result.id;
          log(`+ ${world.nameOf(playerId)} (№${playerId}) — в игре: ${world.playerCount}`);
        } else {
          outbox.send({ t: 'error', message: result.error });
        }
        return;
      }

      if (message.t === 'input') world.queueInput(playerId, message);
      else if (message.t === 'chat') world.chat(playerId, message.text);
    });

    socket.on('close', () => {
      if (playerId === null) return;
      const name = world.nameOf(playerId);
      world.leave(playerId);
      log(`- ${name} (№${playerId}) — в игре: ${world.playerCount}`);
      playerId = null;
    });

    socket.on('error', () => socket.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate(); // сработает 'close' — игрок уйдёт из мира как обычно
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);

  // Тик мира: ровно 20 раз в секунду, с поправкой на неточность таймеров.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let nextTickAt = performance.now();
  const loop = () => {
    const now = performance.now();
    // Если сильно отстали (компьютер «уснул»), не пытаемся догнать сотни тиков разом.
    if (now - nextTickAt > 1000) nextTickAt = now;
    while (now >= nextTickAt) {
      world.step();
      nextTickAt += TICK_MS;
    }
    timer = setTimeout(loop, Math.max(0, nextTickAt - performance.now()));
  };

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, options.host, () => {
      http.off('error', reject);
      const address = http.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      loop();
      resolve({
        port,
        world,
        close: () =>
          new Promise<void>((done) => {
            if (timer) clearTimeout(timer);
            clearInterval(heartbeat);
            for (const client of wss.clients) client.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
