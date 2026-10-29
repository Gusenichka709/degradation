import { effectStrength } from '@game/shared';

/** Клякса-морок: где она и куда ползёт (в процентах экрана). */
interface Blot {
  img: HTMLImageElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

function image(src: string, className: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.className = className;
  img.alt = '';
  img.hidden = true;
  return img;
}

const random = (from: number, to: number) => from + Math.random() * (to - from);

/**
 * Помехи поверх мира. Сервер присылает только номер порога (вместе со шкалой), а что рисовать при нём,
 * лежит в shared/src/effects.ts. Это чистая картинка: на игру и на сервер не влияет.
 * Рисунки — client/public/assets/blot.png, cracks.png, glimpse.png.
 */
export class Haze {
  private readonly root = document.getElementById('haze') as HTMLDivElement;
  private readonly game = document.getElementById('game') as HTMLDivElement;
  private readonly vignette = document.createElement('div');
  private readonly blots: Blot[] = [];
  private readonly cracks: HTMLImageElement[] = [];
  private readonly glimpse = image('assets/glimpse.png', 'haze-glimpse');
  private band = 0;
  private active = false;
  private frame = 0;
  private lastTime = 0;
  private nextGlimpseAt = 0;
  private glimpseUntil = 0;

  constructor() {
    this.vignette.className = 'haze-vignette';
    this.vignette.hidden = true;
    this.root.append(this.vignette);
    for (let i = 0; i < 3; i++) {
      const img = image('assets/blot.png', 'haze-blot');
      this.blots.push({ img, x: random(10, 70), y: random(10, 70), vx: 0, vy: 0, phase: random(0, 6) });
      this.root.append(img);
    }
    // Один рисунок трещин — левый верхний угол; остальные три — он же, отзеркаленный.
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      const img = image('assets/cracks.png', `haze-cracks ${corner}`);
      this.cracks.push(img);
      this.root.append(img);
    }
    this.root.append(this.glimpse);
  }

  /** Вошли в мир — помехи можно рисовать. */
  show(): void {
    this.active = true;
    this.root.hidden = false;
    if (!this.frame) this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  hide(): void {
    this.active = false;
    this.root.hidden = true;
    this.game.style.filter = '';
    this.game.style.transform = '';
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  setBand(band: number): void {
    this.band = band;
  }

  private tick(time: number): void {
    const dt = Math.min(0.1, (time - (this.lastTime || time)) / 1000);
    this.lastTime = time;
    this.drawVignette();
    this.drawBlots(dt, time / 1000);
    this.drawCracks();
    this.drawGlimpse(time);
    this.drawColors(time / 1000);
    if (this.active) this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  /** 40 %: края экрана темнеют, чем глубже — тем сильнее. */
  private drawVignette(): void {
    const s = effectStrength('vignette', this.band);
    this.vignette.hidden = s === 0;
    if (s > 0) this.vignette.style.opacity = String(Math.min(0.9, 0.3 + 0.08 * s));
  }

  /** 35 %: клякса-морок медленно ползает по экрану, глубже их становится больше. */
  private drawBlots(dt: number, t: number): void {
    const s = effectStrength('blot', this.band);
    const count = s === 0 ? 0 : s >= 7 ? 3 : s >= 4 ? 2 : 1;
    this.blots.forEach((blot, i) => {
      blot.img.hidden = i >= count;
      if (blot.img.hidden) return;
      // Скорость понемногу дрейфует, у краёв кляксу тянет обратно.
      blot.vx += random(-1.5, 1.5) * dt - (blot.x - 40) * 0.02 * dt;
      blot.vy += random(-1.5, 1.5) * dt - (blot.y - 40) * 0.02 * dt;
      blot.vx = Math.max(-3, Math.min(3, blot.vx));
      blot.vy = Math.max(-3, Math.min(3, blot.vy));
      blot.x += blot.vx * dt;
      blot.y += blot.vy * dt;
      const pulse = 1 + 0.08 * Math.sin(t * 0.7 + blot.phase);
      blot.img.style.left = `${blot.x}%`;
      blot.img.style.top = `${blot.y}%`;
      blot.img.style.transform = `translate(-50%, -50%) scale(${pulse}) rotate(${(t * 4 + blot.phase * 60) % 360}deg)`;
      blot.img.style.opacity = String(Math.min(0.85, 0.4 + 0.06 * s));
    });
  }

  /** 60 %: трещины по углам экрана, глубже — крупнее и темнее. */
  private drawCracks(): void {
    const s = effectStrength('cracks', this.band);
    for (const img of this.cracks) {
      img.hidden = s === 0;
      img.style.width = `${30 + 6 * s}vmin`;
      img.style.opacity = String(Math.min(0.95, 0.55 + 0.1 * s));
    }
  }

  /** 50 %: «краем глаза» — силуэт на долю секунды у края экрана. Глубже — чаще и дольше. */
  private drawGlimpse(now: number): void {
    const s = effectStrength('glimpse', this.band);
    if (s === 0) {
      this.glimpse.hidden = true;
      this.nextGlimpseAt = 0;
      return;
    }
    if (!this.nextGlimpseAt) this.nextGlimpseAt = now + random(3000, 8000);
    if (now >= this.nextGlimpseAt) {
      const left = Math.random() < 0.5;
      this.glimpse.style.left = left ? `${random(1, 7)}%` : '';
      this.glimpse.style.right = left ? '' : `${random(1, 7)}%`;
      this.glimpse.style.top = `${random(25, 70)}%`;
      this.glimpse.style.transform = left ? '' : 'scaleX(-1)';
      this.glimpseUntil = now + Math.min(900, 120 + 90 * s);
      this.nextGlimpseAt = now + random(12000, 22000) / s;
    }
    this.glimpse.hidden = now >= this.glimpseUntil;
  }

  /** 70 %: цвета мира плывут; на 90 % и глубже мир ещё и чуть качается. */
  private drawColors(t: number): void {
    const s = effectStrength('colors', this.band);
    if (s === 0) {
      this.game.style.filter = '';
      this.game.style.transform = '';
      return;
    }
    const hue = Math.sin(t * 0.23) * 12 * s;
    const saturate = 1 + 0.12 * s * Math.sin(t * 0.17 + 1);
    this.game.style.filter = `hue-rotate(${hue.toFixed(1)}deg) saturate(${saturate.toFixed(2)}) contrast(${(1 + 0.06 * s).toFixed(2)})`;
    // Чуть увеличиваем, чтобы при качании не вылезали края.
    const tilt = (Math.sin(t * 0.5) * 0.4 * (s - 2)).toFixed(2);
    this.game.style.transform = s >= 3 ? `rotate(${tilt}deg) scale(1.04)` : '';
  }
}
