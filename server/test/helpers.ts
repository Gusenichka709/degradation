import assert from 'node:assert/strict';
import type { ServerMessage } from '@game/shared';
import type { Book } from '../src/books';
import { World } from '../src/world';

/**
 * Мир с ручными часами для тестов: время двигаем сами, ждать по-настоящему не надо.
 * У каждого игрока свой список пришедших сообщений. random всегда 0 — всё предсказуемо.
 */
export function makeWorld(options: { books?: readonly Book[] } = {}) {
  const clock = { now: 0 };
  const world = options.books
    ? new World(() => clock.now, () => 0, () => options.books!)
    : new World(() => clock.now, () => 0);
  const inbox = new Map<number, ServerMessage[]>();
  const join = (name: string, local = false) => {
    const sent: ServerMessage[] = [];
    const result = world.join({ send: (message) => sent.push(message) }, name, { local });
    assert.ok(result.ok, 'не пустили в мир');
    inbox.set(result.id, sent);
    return result.id;
  };
  /** Что игрок прочитал в чате: системные сообщения и чужие реплики. */
  const said = (id: number) =>
    inbox.get(id)!.flatMap((m) => (m.t === 'system' ? [m.text] : m.t === 'chat' ? [`${m.name}: ${m.text}`] : []));
  return { world, clock, inbox, join, said };
}

const lastSeq = new WeakMap<World, Map<number, number>>();

/**
 * Ведёт персонажа по точкам: к каждой сначала по X, потом по Y, по нажатию на тик. Упёрся — идёт дальше.
 * Номера нажатий продолжаются от прошлого вызова, иначе сервер счёл бы их повтором.
 */
export function walk(world: World, id: number, ...points: [number, number][]): void {
  const seqs = lastSeq.get(world) ?? new Map<number, number>();
  lastSeq.set(world, seqs);
  const go = (axis: 'x' | 'y', target: number) => {
    for (let i = 0; i < 1000; i++) {
      const before = world.positionOf(id)!;
      const delta = target - before[axis];
      if (Math.abs(delta) < 3) return;
      const step = delta > 0 ? 1 : -1;
      const seq = (seqs.get(id) ?? 0) + 1;
      seqs.set(id, seq);
      world.queueInput(id, { t: 'input', seq, dx: axis === 'x' ? step : 0, dy: axis === 'y' ? step : 0, aim: 0 });
      world.step();
      const after = world.positionOf(id)!;
      if (after.x === before.x && after.y === before.y) return; // упёрлись
    }
  };
  for (const [x, y] of points) {
    go('x', x);
    go('y', y);
  }
}

/** Середина клетки по X и «ноги посередине клетки» по Y. */
export function cell(col: number, row: number): [number, number] {
  return [col * 32 + 16, row * 32 + 21];
}
