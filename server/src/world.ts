import {
  MAX_PLAYERS,
  TICK_MS,
  TICK_SECONDS,
  cleanChatText,
  nameError,
  normalizeName,
  round2,
  spawnPoints,
  stepMovement,
  type InputMessage,
  type PlayerInfo,
  type PlayerSnapshot,
  type ServerMessage,
} from '@game/shared';
import { Degradation, DegradationMemory } from './degradation';

/** То, через что мир отправляет сообщения игроку. На деле это WebSocket, в тестах — заглушка. */
export interface Outbox {
  send(message: ServerMessage): void;
}

interface Player {
  id: number;
  name: string;
  x: number;
  y: number;
  aim: number;
  moving: boolean;
  /** Нажатия, которые пришли, но ещё не учтены. */
  inputs: InputMessage[];
  /** Номер последнего учтённого нажатия: по нему клиент сверяет своё предсказание. */
  lastSeq: number;
  /**
   * Сколько миллисекунд движения игрок «заработал». Каждый тик даёт 50 мс, каждое нажатие тратит 50 мс.
   * Так нельзя бегать быстрее, присылая нажатия пачками (простая защита от ускорения).
   */
  moveBudgetMs: number;
  /** Сколько тиков подряд от игрока не было нажатий. */
  idleTicks: number;
  lastChatAt: number;
  /** Деградация персонажа. Только для сервера — в снимки и сообщения не попадает. */
  degradation: Degradation;
  outbox: Outbox;
}

const MAX_QUEUED_INPUTS = 20;
const MAX_MOVE_BUDGET_MS = 250;
const CHAT_COOLDOWN_MS = 300;
/** Если нажатий нет столько тиков, считаем, что игрок остановился. */
const IDLE_TICKS_TO_STOP = 3;

export type JoinResult = { ok: true; id: number } | { ok: false; error: string };

/**
 * Мир игры. Хранит игроков и 20 раз в секунду делает шаг: двигает всех по их нажатиям
 * и рассылает каждому снимок. Только мир решает, кто где стоит.
 */
export class World {
  private readonly players = new Map<number, Player>();
  private readonly memory: DegradationMemory;
  private nextId = 1;
  tick = 0;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly random: () => number = Math.random,
  ) {
    this.memory = new DegradationMemory(now);
  }

  get playerCount(): number {
    return this.players.size;
  }

  nameOf(id: number): string | undefined {
    return this.players.get(id)?.name;
  }

  degradationOf(id: number): Degradation | undefined {
    return this.players.get(id)?.degradation;
  }

  join(outbox: Outbox, rawName: string): JoinResult {
    const name = normalizeName(rawName);
    const error = nameError(name);
    if (error) return { ok: false, error };
    if (this.players.size >= MAX_PLAYERS) return { ok: false, error: 'Сервер полон, попробуй чуть позже.' };
    const lower = name.toLowerCase();
    for (const other of this.players.values()) {
      if (other.name.toLowerCase() === lower) return { ok: false, error: 'Такое имя уже в игре — выбери другое.' };
    }

    const spots = spawnPoints();
    const spot = spots[Math.floor(this.random() * spots.length)] ?? spots[0]!;
    const player: Player = {
      id: this.nextId++,
      name,
      x: spot.x,
      y: spot.y,
      aim: round2(Math.PI / 2),
      moving: false,
      inputs: [],
      lastSeq: 0,
      moveBudgetMs: 0,
      idleTicks: 0,
      lastChatAt: 0,
      degradation: this.memory.take(name),
      outbox,
    };
    this.players.set(player.id, player);

    outbox.send({ t: 'welcome', id: player.id, tick: this.tick, you: snapshotOf(player), players: this.roster() });
    this.broadcast({ t: 'joined', player: { id: player.id, name } }, player.id);
    this.broadcast({ t: 'system', text: `${name} входит в мир` });
    return { ok: true, id: player.id };
  }

  leave(id: number): void {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.memory.save(player.name, player.degradation);
    this.broadcast({ t: 'left', id });
    this.broadcast({ t: 'system', text: `${player.name} уходит` });
  }

  queueInput(id: number, input: InputMessage): void {
    const player = this.players.get(id);
    if (!player) return;
    const newest = player.inputs[player.inputs.length - 1]?.seq ?? player.lastSeq;
    if (input.seq <= newest) return; // повтор или старьё
    player.inputs.push(input);
    if (player.inputs.length > MAX_QUEUED_INPUTS) player.inputs.shift();
  }

  chat(id: number, rawText: string): void {
    const player = this.players.get(id);
    if (!player) return;
    const text = cleanChatText(rawText);
    if (!text) return;
    const now = this.now();
    if (now - player.lastChatAt < CHAT_COOLDOWN_MS) {
      player.outbox.send({ t: 'system', text: 'Не так быстро — подожди секунду.' });
      return;
    }
    player.lastChatAt = now;
    this.broadcast({ t: 'chat', id, name: player.name, text });
  }

  /** Один тик мира. */
  step(): void {
    this.tick++;
    for (const player of this.players.values()) {
      this.movePlayer(player);
      player.degradation.fade(TICK_SECONDS);
    }

    const players = [...this.players.values()].map(snapshotOf);
    for (const player of this.players.values()) {
      player.outbox.send({ t: 'snap', tick: this.tick, ack: player.lastSeq, players });
    }
  }

  private movePlayer(player: Player): void {
    player.moveBudgetMs = Math.min(player.moveBudgetMs + TICK_MS, MAX_MOVE_BUDGET_MS);
    let processed: InputMessage | null = null;
    while (player.inputs.length > 0 && player.moveBudgetMs >= TICK_MS) {
      const input = player.inputs.shift()!;
      player.moveBudgetMs -= TICK_MS;
      const next = stepMovement(player, input, TICK_SECONDS);
      player.x = next.x;
      player.y = next.y;
      player.aim = input.aim;
      player.lastSeq = input.seq;
      processed = input;
    }

    if (processed) {
      player.idleTicks = 0;
      player.moving = processed.dx !== 0 || processed.dy !== 0;
    } else if (++player.idleTicks >= IDLE_TICKS_TO_STOP) {
      player.moving = false;
    }
  }

  private roster(): PlayerInfo[] {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name }));
  }

  private broadcast(message: ServerMessage, exceptId?: number): void {
    for (const player of this.players.values()) {
      if (player.id !== exceptId) player.outbox.send(message);
    }
  }
}

function snapshotOf(player: Player): PlayerSnapshot {
  return { id: player.id, x: player.x, y: player.y, aim: player.aim, moving: player.moving };
}
