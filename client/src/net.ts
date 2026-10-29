import type { ClientMessage, ServerMessage } from '@game/shared';

type Listener = (message: ServerMessage) => void;

const PING_EVERY_MS = 2000;
/** Сколько тишины от сервера терпим, прежде чем считать связь мёртвой. Снимки идут 20 раз в секунду. */
const SILENCE_LIMIT_MS = 5000;

/** Связь с сервером через WebSocket: отправка, приём, список игроков, пинг и сторож тишины. */
export class Net {
  /** Имена всех, кто сейчас в игре: номер → имя. */
  readonly names = new Map<number, string>();
  /**
   * Пустые кусты и камни (номера в RESOURCE_SPOTS). Храним здесь, а не в сцене: сцена создаётся
   * чуть позже «welcome», и без этого сообщения в промежутке потерялись бы.
   */
  readonly picked = new Set<number>();
  /** Номер порога деградации (0 — ниже 25 %, 11 — 100 %). Точного числа клиент не знает. */
  band = 0;
  /** Сколько миллисекунд сообщение идёт до сервера и обратно. */
  pingMs = 0;
  /** Вызывается, когда связь оборвалась (после того как была установлена). */
  onClose: (() => void) | null = null;

  private socket: WebSocket | null = null;
  private readonly listeners = new Set<Listener>();
  private pingTimer: number | undefined;
  private watchdogTimer: number | undefined;
  private lastMessageAt = 0;

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(url: string): Promise<void> {
    this.drop(false);
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let opened = false;
      this.socket = socket;

      socket.onopen = () => {
        opened = true;
        this.lastMessageAt = performance.now();
        this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now() }), PING_EVERY_MS);
        // Сервер может умереть молча (выдернули Wi-Fi) — тогда закрытия не придёт. Ловим по тишине.
        this.watchdogTimer = window.setInterval(() => {
          if (performance.now() - this.lastMessageAt > SILENCE_LIMIT_MS) this.drop(true);
        }, 1000);
        resolve();
      };
      socket.onerror = () => {
        if (!opened) {
          this.drop(false);
          reject(new Error('Не удалось подключиться к серверу'));
        }
      };
      socket.onclose = () => {
        if (this.socket === socket) this.drop(opened);
      };
      socket.onmessage = (event) => {
        this.lastMessageAt = performance.now();
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        this.handle(message);
      };
    });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** Подписаться на сообщения сервера. Возвращает функцию «отписаться». */
  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Бросить текущее соединение. notify — сообщить игре, что связь пропала. */
  private drop(notify: boolean): void {
    window.clearInterval(this.pingTimer);
    window.clearInterval(this.watchdogTimer);
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    }
    if (notify) this.onClose?.();
  }

  private handle(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome':
        this.names.clear();
        for (const player of message.players) this.names.set(player.id, player.name);
        this.picked.clear();
        for (const id of message.picked) this.picked.add(id);
        break;
      case 'resource':
        if (message.picked) this.picked.add(message.id);
        else this.picked.delete(message.id);
        break;
      case 'scale':
        this.band = message.band;
        break;
      case 'joined':
        this.names.set(message.player.id, message.player.name);
        break;
      case 'left':
        this.names.delete(message.id);
        break;
      case 'pong':
        this.pingMs = Math.round(performance.now() - message.c);
        break;
    }
    for (const listener of [...this.listeners]) listener(message);
  }
}
