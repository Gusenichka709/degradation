import { FEET_HEIGHT, TILE_SIZE } from './constants';

/**
 * Карта деревни, нарисованная буквами: одна буква — одна клетка 32 × 32.
 * Чтобы поменять карту, перерисуй буквы. Все строки должны быть одной длины,
 * иначе игра при запуске скажет, какая строка сломана.
 *
 *   .  трава          "  цветы            ,  дорога          =  мост
 *   ~  вода           T  дерево           #  каменная стена  R  крыша
 *   D  дверь          f  забор            b  куст            r  камень
 *   m  шахта
 *   S  точка, где появляются игроки (это тоже дорога)
 *   L  дверь библиотеки, H  дверь травницы (рисуются как обычная дверь, заходят по E)
 *   K  стена с вывеской библиотеки (книга), Z  стена с вывеской травницы (травы)
 *
 * Сквозь воду, деревья, стены, крыши, двери, заборы, кусты, камни и шахту не пройти.
 * Кусты, камни и шахту собирают по E (см. resources.ts).
 */
const MAP_TEXT = `
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TT..........T.........................~~......TT
TT."....."............."..r..T........~~.T....TT
TT.T...............................T..~~...T..TT
TT.........fffff.RRRRRRRRR............~~b.....TT
TT...RRRRR.f"""f.RRRRRRRRR....RRRRR...~~..r...TT
TT...RRRRR.f"""f.RRRRRRRRR....RRRRR...~~....T.TT
TT...##D##.f"""f.####D####....##D##...~~......TT
TT.....,...ff,ff.....,,.........,.....~~.T."..TT
TT.."..,.....,.."....,,...b.....,...T.~~......TT
TT.....,.....,.......,,....."...,.....~~....T.TT
TTb....,."..",...,,,,,,,,,,.....,.."..~~..T...TT
TT.T...,.....,...,,,,,,,,,,.b...,.....~~.....bTT
TT.....,.....,...,,,,,,,,,,.....,.....~~......TT
TT,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,==,,,,,,TT
TT,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,==,,,,,,TT
TT...............,,,,S,,,,,"......T...~~......TT
TT.b..........T..,,,,,,,,,,.."........~~b.....TT
TT..RRRRRRR......,,,,,,,,,,...........~~.T..r.TT
TT..RRRRRRR..."......,,.....RRRRR..b..~~......TT
TT..RRRRRRR..........,,.....RRRRR.....~~...T..TT
TT..##KL###....b..T..,,.T"..#ZH##...".~~".....TT
TT.....,...........".,,.......,.......~~.....TTT
TT.....,.............,,.......,...r...~~...b..TT
TT,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~......TT
TT........b.....b.....................~~..m.".TT
TT.........r~~~~~r..............."....~~.r....TT
TT.".T......~~~~~.."b..."..T.......T..~~....T.TT
TT....................................~~......TT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
`;

/** Вид клетки: какой буквой рисуется, какой это кусок картинки tiles.png и можно ли сквозь неё пройти. */
export interface TileKind {
  char: string;
  /** Номер кусочка 32 × 32 в tiles.png: слева направо, сверху вниз, начиная с 0. */
  index: number;
  name: string;
  solid: boolean;
}

export const TILE_KINDS: readonly TileKind[] = [
  { char: '.', index: 0, name: 'трава', solid: false },
  { char: '"', index: 1, name: 'цветы', solid: false },
  { char: ',', index: 2, name: 'дорога', solid: false },
  { char: '~', index: 3, name: 'вода', solid: true },
  { char: 'T', index: 4, name: 'дерево', solid: true },
  { char: '#', index: 5, name: 'каменная стена', solid: true },
  { char: 'R', index: 6, name: 'крыша', solid: true },
  { char: 'D', index: 7, name: 'дверь', solid: true },
  { char: '=', index: 8, name: 'мост', solid: false },
  { char: 'f', index: 9, name: 'забор', solid: true },
  { char: 'b', index: 10, name: 'куст', solid: true },
  { char: 'r', index: 11, name: 'камень', solid: true },
  { char: 'm', index: 14, name: 'шахта', solid: true },
  { char: 'K', index: 15, name: 'вывеска библиотеки', solid: true },
  { char: 'Z', index: 16, name: 'вывеска травницы', solid: true },
];

/**
 * Клетки, которых на карте нет буквами: в них превращаются куст и камень после сбора, пока не отрастут.
 * Проходимость не меняется — сквозь пустой куст тоже не пройти.
 */
export const PICKED_BUSH_TILE = 12;
export const PICKED_STONE_TILE = 13;

/** Сколько клеток должно быть в tiles.png, чтобы нарисовать все виды клеток карты. */
export const TILES_NEEDED =
  Math.max(...TILE_KINDS.map((kind) => kind.index), PICKED_BUSH_TILE, PICKED_STONE_TILE) + 1;

/** Особые места: куда можно зайти по E. */
export type PlaceKind = 'library' | 'herbalist';

/**
 * Особые буквы: рисуются как обычная клетка (дорога, дверь), но игра запоминает, где они стоят.
 * Каждая должна быть на карте ровно один раз.
 */
const MARKERS = {
  S: { drawnAs: ',', name: 'точка появления' },
  L: { drawnAs: 'D', name: 'дверь библиотеки' },
  H: { drawnAs: 'D', name: 'дверь травницы' },
} as const;
type MarkerChar = keyof typeof MARKERS;

function isMarker(char: string): char is MarkerChar {
  return char in MARKERS;
}

const KIND_BY_CHAR = new Map(TILE_KINDS.map((kind) => [kind.char, kind]));

function parseMap(text: string) {
  const rows = text.split(/\r?\n/).map((row) => row.trimEnd()).filter((row) => row.length > 0);
  const cols = rows[0]?.length ?? 0;
  const grid: number[][] = [];
  const solid: boolean[][] = [];
  const found = new Map<MarkerChar, { col: number; row: number }[]>();

  for (let row = 0; row < rows.length; row++) {
    const line = rows[row]!;
    if (line.length !== cols) {
      throw new Error(`Карта сломана: в строке ${row + 1} ${line.length} букв, а в первой — ${cols}.`);
    }
    const gridRow: number[] = [];
    const solidRow: boolean[] = [];
    for (let col = 0; col < cols; col++) {
      let char = line[col]!;
      if (isMarker(char)) {
        found.set(char, [...(found.get(char) ?? []), { col, row }]);
        char = MARKERS[char].drawnAs;
      }
      const kind = KIND_BY_CHAR.get(char);
      if (!kind) {
        throw new Error(`Карта сломана: непонятная буква «${char}» в строке ${row + 1}, столбце ${col + 1}.`);
      }
      gridRow.push(kind.index);
      solidRow.push(kind.solid);
    }
    grid.push(gridRow);
    solid.push(solidRow);
  }

  const marker = (char: MarkerChar) => {
    const places = found.get(char) ?? [];
    if (places.length !== 1) {
      const problem = places.length === 0 ? 'нет' : 'больше одной буквы';
      throw new Error(`Карта сломана: ${problem} «${char}» (${MARKERS[char].name}).`);
    }
    return places[0]!;
  };
  const spawn = marker('S');
  const places: Record<PlaceKind, { col: number; row: number }> = { library: marker('L'), herbalist: marker('H') };
  return { cols, rows: rows.length, grid, solid, spawn, places };
}

const parsed = parseMap(MAP_TEXT);

/** Ширина карты в клетках. */
export const MAP_COLS = parsed.cols;
/** Высота карты в клетках. */
export const MAP_ROWS = parsed.rows;
export const MAP_WIDTH_PX = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT_PX = MAP_ROWS * TILE_SIZE;

/** Номера кусочков tiles.png для каждой клетки — по ним клиент рисует карту. */
export const TILE_GRID: readonly (readonly number[])[] = parsed.grid;

/** Клетка, где появляются игроки. */
export const SPAWN_TILE = parsed.spawn;

/** Где двери библиотеки и травницы. */
export const PLACES: Readonly<Record<PlaceKind, { col: number; row: number }>> = parsed.places;

/** Непроходима ли клетка. Всё за краем карты считается стеной. */
export function isSolidTile(col: number, row: number): boolean {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return true;
  return parsed.solid[row]![col]!;
}

/** Точка «под ногами» персонажа, стоящего посередине клетки. */
export function tileCenter(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + (TILE_SIZE + FEET_HEIGHT) / 2 };
}

/** Проходимые клетки вокруг точки появления — чтобы игроки не появлялись друг в друге. */
export function spawnPoints(radius = 2): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let row = SPAWN_TILE.row - radius; row <= SPAWN_TILE.row + radius; row++) {
    for (let col = SPAWN_TILE.col - radius; col <= SPAWN_TILE.col + radius; col++) {
      if (!isSolidTile(col, row)) points.push(tileCenter(col, row));
    }
  }
  return points;
}
