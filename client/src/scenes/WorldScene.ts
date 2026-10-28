import Phaser from 'phaser';
import {
  AIM_ORIGIN_OFFSET_Y,
  INTERPOLATION_DELAY_MS,
  MAP_HEIGHT_PX,
  MAP_WIDTH_PX,
  TICK_MS,
  TICK_SECONDS,
  TILE_GRID,
  TILE_SIZE,
  facingFromAngle,
  normalizeAngle,
  round2,
  stepMovement,
  type InputMessage,
  type PlayerSnapshot,
  type Point,
  type ServerMessage,
} from '@game/shared';
import type { Net } from '../net';
import type { ChatBox } from '../ui/chat';
import type { Hud } from '../ui/hud';
import { DIRECTION_NAMES, HERO_FRAMES_PER_ROW } from './BootScene';

export interface WorldSceneData {
  net: Net;
  chat: ChatBox;
  hud: Hud;
  myId: number;
  you: PlayerSnapshot;
  tick: number;
}

/** Во сколько раз камера увеличивает пиксели. */
const CAMERA_ZOOM = 2;
/** Сколько неподтверждённых нажатий храним (на случай, если сервер задумался). */
const MAX_PENDING_INPUTS = 60;
/** Если предсказание разошлось с сервером сильнее, просто переносимся, без плавности. */
const SNAP_DISTANCE = TILE_SIZE * 2;
/** Имя висит на 60 пикселей выше ног — над головой и над стрелкой прицела. */
const NAME_OFFSET_Y = 60;
/**
 * Стрелка прицела ходит по овалу вокруг груди: по бокам на 24 пикселя, сверху и снизу на 30.
 * Так она не ложится ни на ноги (прицел вниз), ни на голову (прицел вверх).
 */
const AIM_RADIUS_X = 24;
const AIM_RADIUS_Y = 30;

/** Положение чужого игрока в момент времени сервера. */
interface Sample {
  time: number;
  x: number;
  y: number;
  aim: number;
  moving: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  return a + normalizeAngle(b - a) * t;
}

/** Персонаж на экране: спрайт, имя над головой и стрелка прицела. */
class Avatar {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  readonly aimMarker: Phaser.GameObjects.Image;
  readonly samples: Sample[] = [];
  x = 0;
  y = 0;
  aim = Math.PI / 2;
  moving = false;

  constructor(scene: Phaser.Scene, name: string, isMe: boolean) {
    this.sprite = scene.add.sprite(0, 0, 'hero', 1).setOrigin(0.5, 1);
    this.label = scene.add
      .text(0, 0, name, {
        fontFamily: 'Verdana, Tahoma, sans-serif',
        fontSize: '8px',
        color: isMe ? '#ffe9a8' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        resolution: CAMERA_ZOOM,
      })
      .setOrigin(0.5, 1)
      .setDepth(1_000_000);
    this.aimMarker = scene.add.image(0, 0, 'aim').setAlpha(isMe ? 0.9 : 0.45).setDepth(999_999);
  }

  setName(name: string): void {
    this.label.setText(name);
  }

  /** Переносит картинку туда, где персонаж сейчас, и выбирает кадр. */
  draw(): void {
    // Чем ниже на экране, тем «ближе» — рисуем поверх тех, кто выше.
    this.sprite.setPosition(this.x, this.y).setDepth(this.y);
    // Имя ставим на сетку полупикселей: при зуме ×2 это ровно экранные пиксели, текст не мылится.
    this.label.setPosition(Math.round(this.x * 2) / 2, Math.round((this.y - NAME_OFFSET_Y) * 2) / 2);
    const chestY = this.y - AIM_ORIGIN_OFFSET_Y;
    this.aimMarker
      .setPosition(this.x + Math.cos(this.aim) * AIM_RADIUS_X, chestY + Math.sin(this.aim) * AIM_RADIUS_Y)
      .setRotation(this.aim);

    const facing = facingFromAngle(this.aim);
    if (this.moving) {
      this.sprite.anims.play(`hero-walk-${DIRECTION_NAMES[facing]}`, true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(facing * HERO_FRAMES_PER_ROW + 1);
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.aimMarker.destroy();
  }
}

type MovementKeys = Record<'up' | 'down' | 'left' | 'right' | 'up2' | 'down2' | 'left2' | 'right2', Phaser.Input.Keyboard.Key>;

/**
 * Мир на экране.
 *
 * Как устроено движение:
 * 1. 20 раз в секунду читаем клавиши, сразу двигаем своего персонажа (предсказание) и шлём нажатие серверу.
 * 2. Сервер присылает снимок: где все на самом деле и какое наше нажатие он учёл последним.
 * 3. Мы берём позицию сервера и заново применяем нажатия, которые он ещё не учёл. Если всё честно,
 *    результат совпадает с предсказанием и игрок ничего не замечает.
 * 4. Чужих игроков показываем чуть в прошлом (на 100 мс) и плавно ведём между снимками.
 */
export class WorldScene extends Phaser.Scene {
  private net!: Net;
  private chat!: ChatBox;
  private hud!: Hud;
  private myId = 0;

  private me!: Avatar;
  private readonly others = new Map<number, Avatar>();
  private keys!: MovementKeys;

  private predicted: Point = { x: 0, y: 0 };
  private previous: Point = { x: 0, y: 0 };
  private pending: InputMessage[] = [];
  private seq = 0;
  private accumulator = 0;
  private aim = Math.PI / 2;
  private pointerMoved = false;

  /** Разница между часами сервера и нашими: серверное время ≈ performance.now() + serverOffset. */
  private serverOffset: number | null = null;
  private lastTick = 0;
  private corrections = 0;
  private hudTimer = 0;

  constructor() {
    super('world');
  }

  init(data: WorldSceneData): void {
    this.net = data.net;
    this.chat = data.chat;
    this.hud = data.hud;
    this.myId = data.myId;
    this.predicted = { x: data.you.x, y: data.you.y };
    this.previous = { ...this.predicted };
    this.aim = data.you.aim;
    this.lastTick = data.tick;
    this.pending = [];
    this.seq = 0;
    this.accumulator = 0;
    this.serverOffset = null;
    this.others.clear();
  }

  create(): void {
    const map = this.make.tilemap({
      data: TILE_GRID.map((row) => [...row]),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tiles = map.addTilesetImage('tiles');
    if (tiles) map.createLayer(0, tiles, 0, 0);

    this.me = new Avatar(this, this.net.names.get(this.myId) ?? 'я', true);
    this.me.x = this.predicted.x;
    this.me.y = this.predicted.y;
    this.me.draw();

    const camera = this.cameras.main;
    camera.setZoom(CAMERA_ZOOM);
    camera.setBounds(0, 0, MAP_WIDTH_PX, MAP_HEIGHT_PX);
    camera.startFollow(this.me.sprite, false, 1, 1, 0, AIM_ORIGIN_OFFSET_Y);

    // false — не перехватываем клавиши у браузера, иначе в чат нельзя было бы напечатать W, A, S, D.
    this.keys = this.input.keyboard!.addKeys(
      { up: 'W', down: 'S', left: 'A', right: 'D', up2: 'UP', down2: 'DOWN', left2: 'LEFT', right2: 'RIGHT' },
      false,
    ) as MovementKeys;
    this.input.on('pointermove', () => {
      this.pointerMoved = true;
    });
    // Ушли в другое окно — отпускаем клавиши, чтобы персонаж не убежал сам.
    this.game.events.on(Phaser.Core.Events.BLUR, this.releaseKeys, this);

    const unsubscribe = this.net.on((message) => this.onMessage(message));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.game.events.off(Phaser.Core.Events.BLUR, this.releaseKeys, this);
      for (const avatar of this.others.values()) avatar.destroy();
      this.others.clear();
    });
  }

  override update(_time: number, delta: number): void {
    this.aim = this.readAim();

    // Не больше 5 тиков за кадр: если вкладка висела, не пытаемся догнать всё разом.
    this.accumulator = Math.min(this.accumulator + delta, TICK_MS * 5);
    while (this.accumulator >= TICK_MS) {
      this.fixedTick();
      this.accumulator -= TICK_MS;
    }

    // Свой персонаж плавно между двумя последними тиками, чтобы не дёргался 20 раз в секунду.
    const t = this.accumulator / TICK_MS;
    this.me.x = lerp(this.previous.x, this.predicted.x, t);
    this.me.y = lerp(this.previous.y, this.predicted.y, t);
    this.me.aim = this.aim;
    this.me.draw();

    this.drawOthers();

    this.hudTimer -= delta;
    if (this.hudTimer <= 0) {
      this.hudTimer = 250;
      this.hud.update({
        online: this.net.names.size,
        ping: this.net.pingMs,
        fps: Math.round(this.game.loop.actualFps),
        x: this.predicted.x,
        y: this.predicted.y,
        tick: this.lastTick,
        pending: this.pending.length,
        corrections: this.corrections,
      });
    }
  }

  /** Один тик: читаем клавиши, двигаемся сами и сообщаем серверу. */
  private fixedTick(): void {
    const k = this.keys;
    const typing = this.chat.typing;
    const right = !typing && (k.right.isDown || k.right2.isDown);
    const left = !typing && (k.left.isDown || k.left2.isDown);
    const down = !typing && (k.down.isDown || k.down2.isDown);
    const up = !typing && (k.up.isDown || k.up2.isDown);
    const input: InputMessage = {
      t: 'input',
      seq: ++this.seq,
      dx: Number(right) - Number(left),
      dy: Number(down) - Number(up),
      aim: round2(normalizeAngle(this.aim)),
    };

    this.previous = this.predicted;
    this.predicted = stepMovement(this.predicted, input, TICK_SECONDS);
    this.me.moving = input.dx !== 0 || input.dy !== 0;

    this.pending.push(input);
    if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
    this.net.send(input);
  }

  private readAim(): number {
    if (!this.pointerMoved) return this.aim;
    const pointer = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return Math.atan2(world.y - (this.me.y - AIM_ORIGIN_OFFSET_Y), world.x - this.me.x);
  }

  private releaseKeys(): void {
    this.input.keyboard?.resetKeys();
  }

  private onMessage(message: ServerMessage): void {
    switch (message.t) {
      case 'snap':
        this.onSnapshot(message.tick, message.ack, message.players);
        break;
      case 'joined':
        this.others.get(message.player.id)?.setName(message.player.name);
        break;
      case 'left':
        this.others.get(message.id)?.destroy();
        this.others.delete(message.id);
        break;
    }
  }

  private onSnapshot(tick: number, ack: number, players: PlayerSnapshot[]): void {
    const serverTime = tick * TICK_MS;
    const sample = serverTime - performance.now();
    // Самый «быстрый» снимок точнее всего показывает разницу часов, поэтому берём максимум
    // и понемногу его отпускаем — на случай, если связь стала медленнее.
    this.serverOffset = this.serverOffset === null ? sample : Math.max(sample, this.serverOffset - 0.5);
    this.lastTick = tick;

    const present = new Set<number>();
    for (const player of players) {
      present.add(player.id);
      if (player.id === this.myId) {
        this.reconcile(player, ack);
        continue;
      }
      let avatar = this.others.get(player.id);
      if (!avatar) {
        avatar = new Avatar(this, this.net.names.get(player.id) ?? '…', false);
        avatar.x = player.x;
        avatar.y = player.y;
        this.others.set(player.id, avatar);
      }
      avatar.samples.push({ time: serverTime, x: player.x, y: player.y, aim: player.aim, moving: player.moving });
      if (avatar.samples.length > 40) avatar.samples.shift();
    }

    for (const [id, avatar] of this.others) {
      if (!present.has(id)) {
        avatar.destroy();
        this.others.delete(id);
      }
    }
  }

  /** Сверяем своё предсказание с сервером. */
  private reconcile(server: PlayerSnapshot, ack: number): void {
    this.pending = this.pending.filter((input) => input.seq > ack);
    let position: Point = { x: server.x, y: server.y };
    for (const input of this.pending) position = stepMovement(position, input, TICK_SECONDS);

    const error = Math.hypot(position.x - this.predicted.x, position.y - this.predicted.y);
    if (error > 0.01) {
      this.corrections++;
      if (error > SNAP_DISTANCE) this.previous = position;
      this.predicted = position;
    }
  }

  /** Чужие игроки: показываем их на 100 мс в прошлом, плавно между двумя снимками. */
  private drawOthers(): void {
    if (this.serverOffset === null) return;
    const renderTime = performance.now() + this.serverOffset - INTERPOLATION_DELAY_MS;

    for (const avatar of this.others.values()) {
      const samples = avatar.samples;
      while (samples.length >= 2 && samples[1]!.time <= renderTime) samples.shift();
      const from = samples[0];
      if (!from) continue;
      const to = samples[1];

      if (!to || renderTime <= from.time) {
        avatar.x = from.x;
        avatar.y = from.y;
        avatar.aim = from.aim;
        avatar.moving = from.moving;
      } else {
        const t = (renderTime - from.time) / (to.time - from.time);
        avatar.x = lerp(from.x, to.x, t);
        avatar.y = lerp(from.y, to.y, t);
        avatar.aim = lerpAngle(from.aim, to.aim, t);
        avatar.moving = to.moving;
      }
      avatar.draw();
    }
  }
}
