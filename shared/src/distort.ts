import { DISTORT_FROM, DISTORT_MAX_SHARE } from './constants';

/** Похожие буквы: в искажённом тексте одна подменяется другой. */
const SIMILAR: Record<string, string> = {
  а: 'о',
  о: 'а',
  е: 'и',
  и: 'е',
  ш: 'щ',
  щ: 'ш',
  п: 'н',
  н: 'п',
  т: 'г',
  г: 'т',
  л: 'д',
  д: 'л',
  в: 'б',
  б: 'в',
  з: 'э',
  э: 'з',
  ь: 'ъ',
  ъ: 'ь',
  с: 'е',
  у: 'ю',
  ю: 'у',
  я: 'а',
};

const LETTER = /\p{L}/u;

/**
 * Какая доля букв искажена: до 10 % — ничего, на 100 % — почти половина.
 * Для книг сюда идёт деградация читающего, для чата — разница деградаций автора и читающего.
 */
export function distortionShare(degradation: number): number {
  if (degradation <= DISTORT_FROM) return 0;
  return (Math.min(degradation, 100) - DISTORT_FROM) / (100 - DISTORT_FROM) * DISTORT_MAX_SHARE;
}

function similar(char: string): string | null {
  const lower = char.toLowerCase();
  const swap = SIMILAR[lower];
  if (!swap) return null;
  return char === lower ? swap : swap.toUpperCase();
}

/**
 * Коверкает текст: каждая буква с вероятностью share подменяется похожей, меняется местами
 * с соседней или пропадает. Пробелы и знаки препинания не трогаем — слова остаются на месте.
 * Целые слова пока не меняем (прототип). Книги и чат коверкает сервер — клиент получает уже искажённое;
 * клиент сам коверкает только то, что и так знает (имена над головами).
 */
export function distortText(text: string, share: number, random: () => number): string {
  if (share <= 0) return text;
  const chars = [...text];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    if (!LETTER.test(char) || random() >= share) {
      out.push(char);
      continue;
    }
    const roll = random();
    const next = chars[i + 1];
    const look = similar(char);
    if (roll < 0.45 && look) {
      out.push(look);
    } else if (roll < 0.8 && next && LETTER.test(next)) {
      out.push(next, char);
      i++;
    } else if (roll >= 0.8 && (out.length > 0 && LETTER.test(out.at(-1)!))) {
      // букву проглотили (но не первую в слове — иначе слово можно потерять целиком)
    } else {
      out.push(char);
    }
  }
  return out.join('');
}
