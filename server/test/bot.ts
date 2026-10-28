import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@game/shared';

export type Message<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Игрок-бот для тестов: подключается к серверу и запоминает всё, что пришло. */
export class Bot {
  readonly messages: ServerMessage[] = [];
  private readonly waiters = new Set<(message: ServerMessage) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(message);
      for (const waiter of [...this.waiters]) waiter(message);
    });
  }

  /** autoPong: false — бот притворяется мёртвым и не отвечает на проверки сервера. */
  static connect(port: number, options: { autoPong?: boolean } = {}): Promise<Bot> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`, { autoPong: options.autoPong ?? true });
      socket.once('open', () => resolve(new Bot(socket)));
      socket.once('error', reject);
    });
  }

  send(message: ClientMessage | Record<string, unknown> | string): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  async join(name: string): Promise<Message<'welcome'>> {
    this.send({ t: 'join', name });
    return this.waitFor('welcome');
  }

  /** Последний снимок мира, который получил бот. */
  lastSnap(): Message<'snap'> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i]!;
      if (message.t === 'snap') return message;
    }
    return undefined;
  }

  count(type: ServerMessage['t']): number {
    return this.messages.filter((message) => message.t === type).length;
  }

  waitFor<T extends ServerMessage['t']>(
    type: T,
    predicate: (message: Message<T>) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<Message<T>> {
    const matches = (message: ServerMessage): message is Message<T> =>
      message.t === type && predicate(message as Message<T>);
    const earlier = this.messages.find(matches);
    if (earlier) return Promise.resolve(earlier);
    return new Promise((resolve, reject) => {
      const waiter = (message: ServerMessage) => {
        if (!matches(message)) return;
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(message);
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Не дождались сообщения «${type}» за ${timeoutMs} мс`));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket.readyState === WebSocket.CLOSED) return resolve();
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }
}
