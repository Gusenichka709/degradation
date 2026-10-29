import { TILE_SIZE } from '@game/shared';

export interface HudInfo {
  online: number;
  ping: number;
  fps: number;
  x: number;
  y: number;
  tick: number;
  pending: number;
  corrections: number;
  band: number;
}

/** Строчка сверху слева: кто в сети и пинг. F3 — подробности для отладки. */
export class Hud {
  private readonly root = document.getElementById('hud') as HTMLDivElement;
  private readonly help = document.getElementById('help') as HTMLDivElement;
  private debug = false;

  constructor() {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'F3') {
        event.preventDefault();
        this.debug = !this.debug;
      }
    });
  }

  show(): void {
    this.root.hidden = false;
    this.help.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.help.hidden = true;
  }

  update(info: HudInfo): void {
    const lines = [`В игре: ${info.online} · пинг: ${info.ping} мс`];
    if (this.debug) {
      lines.push(
        `FPS: ${info.fps}`,
        `x ${info.x.toFixed(1)} · y ${info.y.toFixed(1)} · клетка ${Math.floor(info.x / TILE_SIZE)}, ${Math.floor(info.y / TILE_SIZE)}`,
        `тик сервера: ${info.tick}`,
        `ждут ответа сервера: ${info.pending} · поправок: ${info.corrections}`,
        `порог помех: ${info.band}`,
      );
    }
    this.root.textContent = lines.join('\n');
  }
}
