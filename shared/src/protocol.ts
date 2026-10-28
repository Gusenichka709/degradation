import { normalizeAngle, round2, toAxis } from './movement';

/**
 * Сообщения между клиентом и сервером. Ходят по WebSocket в виде JSON.
 * Поле t — тип сообщения.
 */

/** Положение игрока в одном снимке мира. */
export interface PlayerSnapshot {
  id: number;
  x: number;
  y: number;
  /** Угол прицела в радианах. */
  aim: number;
  /** Идёт ли игрок (для анимации шага). */
  moving: boolean;
}

/** Кто в игре: номер и имя. Имена шлём отдельно от снимков — они меняются редко. */
export interface PlayerInfo {
  id: number;
  name: string;
}

/** Нажатия игрока за один тик. seq — порядковый номер, по нему клиент сверяет предсказание. */
export interface InputMessage {
  t: 'input';
  seq: number;
  dx: number;
  dy: number;
  aim: number;
}

/** Клиент → сервер. */
export type ClientMessage =
  | { t: 'join'; name: string }
  | InputMessage
  | { t: 'chat'; text: string }
  | { t: 'ping'; c: number };

/** Сервер → клиент. */
export type ServerMessage =
  /** Тебя пустили в мир: твой номер, где ты стоишь и кто ещё в игре. */
  | { t: 'welcome'; id: number; tick: number; you: PlayerSnapshot; players: PlayerInfo[] }
  /** Не пустили: имя занято, сервер полон и т. п. */
  | { t: 'error'; message: string }
  /** Снимок мира, 20 раз в секунду. ack — номер твоего последнего учтённого нажатия. */
  | { t: 'snap'; tick: number; ack: number; players: PlayerSnapshot[] }
  | { t: 'joined'; player: PlayerInfo }
  | { t: 'left'; id: number }
  | { t: 'chat'; id: number; name: string; text: string }
  | { t: 'system'; text: string }
  | { t: 'pong'; c: number };

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeInt(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

/**
 * Разбирает сообщение от клиента. Всё подозрительное отбрасывает (возвращает null):
 * сервер никогда не верит клиенту на слово.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;

  switch (m.t) {
    case 'join': {
      const name = m.name;
      return typeof name === 'string' ? { t: 'join', name } : null;
    }
    case 'input': {
      const { seq, dx, dy, aim } = m;
      if (!isSafeInt(seq) || seq < 1 || !isNumber(dx) || !isNumber(dy) || !isNumber(aim)) return null;
      return { t: 'input', seq, dx: toAxis(dx), dy: toAxis(dy), aim: round2(normalizeAngle(aim)) };
    }
    case 'chat': {
      const text = m.text;
      return typeof text === 'string' ? { t: 'chat', text } : null;
    }
    case 'ping': {
      const c = m.c;
      return isNumber(c) ? { t: 'ping', c } : null;
    }
    default:
      return null;
  }
}
