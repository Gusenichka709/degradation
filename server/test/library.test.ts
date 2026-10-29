import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIBRARY_COOLDOWN_MS,
  POTION_COOLDOWN_MS,
  POTION_RELIEF,
  USE_COOLDOWN_MS,
  distortText,
  distortionShare,
  type ServerMessage,
} from '@game/shared';
import { loadBooks, parseBook, type Book } from '../src/books';
import { makeWorld, walk } from './helpers';

const SAMPLE = `Название: Проба пера

Первый абзац.

Второй абзац.

Вопрос: Сколько абзацев?
- один
* два
- три
`;

/** Дорога от точки появления к двери библиотеки: вниз в обход дома, потом влево и вверх до двери. */
const TO_LIBRARY: [number, number][] = [
  [400, 501],
  [400, 757],
  [240, 757],
  [240, 700],
];
/** Дорога к двери травницы: вправо по дороге, вниз за домом, влево и вверх до двери. */
const TO_HERBALIST: [number, number][] = [
  [1072, 501],
  [1072, 757],
  [976, 757],
  [976, 700],
];

function lastBook(messages: ServerMessage[]) {
  const book = messages.filter((m) => m.t === 'book').at(-1);
  assert.ok(book?.t === 'book', 'книга не пришла');
  return book;
}

test('книга разбирается из текста, а сломанная — с понятной ошибкой', () => {
  const book = parseBook('проба.txt', SAMPLE.replaceAll('\n', '\r\n'));
  assert.ok(typeof book !== 'string', String(book));
  assert.equal(book.title, 'Проба пера');
  assert.equal(book.text, 'Первый абзац.\n\nВторой абзац.');
  assert.equal(book.question, 'Сколько абзацев?');
  assert.deepEqual(book.options, ['один', 'два', 'три']);
  assert.equal(book.correct, 1);

  assert.match(String(parseBook('a.txt', SAMPLE.replace('Название:', 'Имя:'))), /Название/);
  assert.match(String(parseBook('a.txt', SAMPLE.replace('Вопрос:', 'Спрос:'))), /Вопрос/);
  assert.match(String(parseBook('a.txt', SAMPLE.replace('* два', '- два'))), /звёздочкой/);
  assert.match(String(parseBook('a.txt', SAMPLE.replace('- один', '* один'))), /один/);
});

test('все книги в content/books целые', () => {
  const { books, problems } = loadBooks();
  assert.deepEqual(problems, []);
  assert.ok(books.length >= 3, `книг всего ${books.length}`);
});

test('искажение текста: до 10 % чисто, глубже буквы путаются, но слова на месте', () => {
  assert.equal(distortionShare(-5), 0);
  assert.equal(distortionShare(10), 0);
  assert.ok(Math.abs(distortionShare(100) - 0.45) < 0.0001);

  const text = 'Старики говорят, что слово «ведьма» пошло от «ведать», то есть знать.';
  assert.equal(distortText(text, 0, Math.random), text);
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const deep = distortText(text, distortionShare(100), random);
  assert.notEqual(deep, text);
  assert.equal(deep.split(' ').length, text.split(' ').length, 'слова не должны слипаться и пропадать');
});

test('библиотека: книга, правильный ответ опускает истинную деградацию, следующая — через 3 минуты', () => {
  const book = parseBook('проба.txt', SAMPLE) as Book;
  const { world, clock, inbox, join, said } = makeWorld({ books: [book] });
  const id = join('Читатель');
  world.degradationOf(id)!.grow(8); // до 10 % книга без искажений
  walk(world, id, ...TO_LIBRARY);

  clock.now = 10_000;
  world.use(id);
  const open = lastBook(inbox.get(id)!);
  assert.equal(open.title, 'Проба пера');
  assert.deepEqual([...open.options].sort(), ['два', 'один', 'три']);
  assert.deepEqual(Object.keys(open).sort(), ['options', 'question', 't', 'text', 'title'], 'лишнее в книге');
  world.answer(id, open.options.indexOf('два'));
  assert.equal(world.degradationOf(id)!.actual, 3);
  assert.equal(said(id).at(-1), 'Ты понял прочитанное. В голове чуть яснее.');

  // Ответить второй раз на ту же книгу нельзя.
  world.answer(id, open.options.indexOf('два'));
  assert.equal(world.degradationOf(id)!.actual, 3);

  clock.now += USE_COOLDOWN_MS;
  world.use(id);
  assert.match(said(id).at(-1)!, /Приходи через 3 мин/);

  clock.now += LIBRARY_COOLDOWN_MS;
  world.use(id);
  const again = lastBook(inbox.get(id)!);
  world.answer(id, again.options.indexOf('три'));
  assert.equal(world.degradationOf(id)!.actual, 3);
  assert.equal(said(id).at(-1), 'Ты ничего не понял. Может, в другой раз.');
});

test('глубоко деградировавшему книга приходит искажённой', () => {
  const book = parseBook('проба.txt', SAMPLE) as Book;
  const { world, inbox, join } = makeWorld({ books: [book] });
  const id = join('Глубокий');
  world.degradationOf(id)!.grow(60);
  walk(world, id, ...TO_LIBRARY);
  world.use(id);
  const open = lastBook(inbox.get(id)!);
  assert.notEqual(open.text, book.text);
  assert.notEqual(open.question, book.question);
});

test('травница: зелье опускает текущую деградацию, истинную не трогает, наливает раз в минуту', () => {
  const { world, clock, join, said } = makeWorld();
  const id = join('Пьющий');
  const d = world.degradationOf(id)!;
  d.grow(40);
  walk(world, id, ...TO_HERBALIST);

  clock.now = 10_000;
  world.use(id);
  assert.equal(d.actual, 40);
  assert.equal(d.current, 40 - POTION_RELIEF);
  assert.equal(said(id).at(-1), 'Ты выпил отвар травницы. В голове проясняется.');

  clock.now += USE_COOLDOWN_MS;
  world.use(id);
  assert.equal(d.current, 40 - POTION_RELIEF);
  assert.match(said(id).at(-1)!, /Хватит с тебя/);

  clock.now += POTION_COOLDOWN_MS;
  world.use(id);
  assert.equal(d.current, 40 - 2 * POTION_RELIEF);
});
