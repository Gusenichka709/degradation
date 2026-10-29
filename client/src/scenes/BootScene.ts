import Phaser from 'phaser';
import { HERO_FRAME_HEIGHT, HERO_FRAME_WIDTH, TILE_SIZE, TILES_NEEDED } from '@game/shared';

/** Названия направлений по рядам листа персонажа: ряд 0 — вниз, 1 — влево, 2 — вправо, 3 — вверх. */
export const DIRECTION_NAMES = ['down', 'left', 'right', 'up'] as const;
/** Сколько кадров в ряду: шаг левой, стойка, шаг правой. */
export const HERO_FRAMES_PER_ROW = 3;

const HERO_SHEET_WIDTH = HERO_FRAME_WIDTH * HERO_FRAMES_PER_ROW;
const HERO_SHEET_HEIGHT = HERO_FRAME_HEIGHT * DIRECTION_NAMES.length;
const AIM_MAX_SIZE = 64;
/** Клеток в ряду tiles.png. */
const TILES_PER_ROW = 4;
/** Силуэт «краем глаза» — ровно кадр персонажа. */
const GLIMPSE_WIDTH = 32;
const GLIMPSE_HEIGHT = 48;
/** Рисованные помехи (клякса, трещины): от 64 до 1024 пикселей по стороне — игра их масштабирует сама. */
const HAZE_MIN_SIZE = 64;
const HAZE_MAX_SIZE = 1024;

/** Загружает картинки и готовит анимации. Свои рисунки просто клади вместо файлов в client/public/assets. */
export class BootScene extends Phaser.Scene {
  private readonly failed: string[] = [];

  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failed.push(String(file.key));
    });
    this.load.image('tiles', 'assets/tiles.png');
    this.load.spritesheet('hero', 'assets/hero.png', {
      frameWidth: HERO_FRAME_WIDTH,
      frameHeight: HERO_FRAME_HEIGHT,
    });
    this.load.image('aim', 'assets/aim.png');
    // Помехи рисуются поверх игры обычными картинками страницы; здесь грузим только для проверки размеров.
    this.load.image('blot', 'assets/blot.png');
    this.load.image('cracks', 'assets/cracks.png');
    this.load.image('glimpse', 'assets/glimpse.png');
  }

  create(): void {
    const problems = this.checkAssets();
    if (problems.length > 0) {
      for (const problem of problems) console.warn(problem);
      this.game.events.emit('assets-problems', problems);
    }

    DIRECTION_NAMES.forEach((direction, row) => {
      const first = row * HERO_FRAMES_PER_ROW;
      this.anims.create({
        key: `hero-walk-${direction}`,
        // Шаг левой → стойка → шаг правой → стойка.
        frames: this.anims.generateFrameNumbers('hero', { frames: [first, first + 1, first + 2, first + 1] }),
        frameRate: 8,
        repeat: -1,
      });
    });
    this.game.events.emit('assets-ready');
  }

  /** Проверяет, что картинки загрузились и нужного размера. Возвращает понятные ошибки по-русски. */
  private checkAssets(): string[] {
    const problems: string[] = [];
    const size = (key: string) => {
      if (this.failed.includes(key) || !this.textures.exists(key)) return null;
      const source = this.textures.get(key).source[0];
      return source ? { w: source.width, h: source.height } : null;
    };
    const missing = (file: string) =>
      `Не загрузилась картинка assets/${file}. Проверь, что файл на месте и называется ровно так.`;

    const tiles = size('tiles');
    if (!tiles) {
      problems.push(missing('tiles.png'));
    } else if (tiles.w % TILE_SIZE !== 0 || tiles.h % TILE_SIZE !== 0) {
      problems.push(`tiles.png: ${tiles.w} × ${tiles.h} — ширина и высота должны делиться на ${TILE_SIZE}.`);
    } else {
      const count = (tiles.w / TILE_SIZE) * (tiles.h / TILE_SIZE);
      if (count < TILES_NEEDED) {
        const height = Math.ceil(TILES_NEEDED / TILES_PER_ROW) * TILE_SIZE;
        problems.push(
          `tiles.png: в картинке ${count} клеток, а карте нужно ${TILES_NEEDED} — ` +
            `сделай холст ${TILES_PER_ROW * TILE_SIZE} × ${height}.`,
        );
      }
    }

    const hero = size('hero');
    if (!hero) {
      problems.push(missing('hero.png'));
    } else if (hero.w !== HERO_SHEET_WIDTH || hero.h !== HERO_SHEET_HEIGHT) {
      problems.push(
        `hero.png: ${hero.w} × ${hero.h}, а нужно ровно ${HERO_SHEET_WIDTH} × ${HERO_SHEET_HEIGHT} ` +
          `(3 кадра ${HERO_FRAME_WIDTH} × ${HERO_FRAME_HEIGHT} в ряд, 4 ряда).`,
      );
    }

    const aim = size('aim');
    if (!aim) {
      problems.push(missing('aim.png'));
    } else if (aim.w > AIM_MAX_SIZE || aim.h > AIM_MAX_SIZE) {
      problems.push(`aim.png: ${aim.w} × ${aim.h} — великовато, нужно не больше ${AIM_MAX_SIZE} × ${AIM_MAX_SIZE}.`);
    }

    for (const file of ['blot', 'cracks']) {
      const haze = size(file);
      if (!haze) {
        problems.push(missing(`${file}.png`));
      } else if (Math.min(haze.w, haze.h) < HAZE_MIN_SIZE || Math.max(haze.w, haze.h) > HAZE_MAX_SIZE) {
        problems.push(
          `${file}.png: ${haze.w} × ${haze.h} — нужно от ${HAZE_MIN_SIZE} до ${HAZE_MAX_SIZE} пикселей по стороне ` +
            '(заглушка 256 × 256).',
        );
      }
    }

    const glimpse = size('glimpse');
    if (!glimpse) {
      problems.push(missing('glimpse.png'));
    } else if (glimpse.w !== GLIMPSE_WIDTH || glimpse.h !== GLIMPSE_HEIGHT) {
      problems.push(
        `glimpse.png: ${glimpse.w} × ${glimpse.h}, а нужно ровно ${GLIMPSE_WIDTH} × ${GLIMPSE_HEIGHT} (как кадр персонажа).`,
      );
    }

    return problems;
  }
}
