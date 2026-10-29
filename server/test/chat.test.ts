import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeWorld } from './helpers';

const PHRASE = 'привет, пойдём собирать ягоды у старой мельницы';

function heard(messages: ReturnType<typeof makeWorld>['inbox'], id: number): string {
  const line = messages.get(id)!.filter((m) => m.t === 'chat').at(-1);
  assert.ok(line?.t === 'chat', 'реплика не дошла');
  return line.text;
}

test('чат: близкие по деградации слышат чисто, далёкие — исковерканно, себя видишь как написал', () => {
  const { world, clock, inbox, join } = makeWorld();
  const author = join('Автор');
  const near = join('Сосед');
  const far = join('Дальний');
  world.degradationOf(author)!.grow(20);
  world.degradationOf(near)!.grow(25);
  world.degradationOf(far)!.grow(90);

  clock.now = 10_000;
  world.chat(author, PHRASE);
  assert.equal(heard(inbox, author), PHRASE);
  assert.equal(heard(inbox, near), PHRASE);
  const garbled = heard(inbox, far);
  assert.notEqual(garbled, PHRASE);
  assert.equal(garbled.split(' ').length, PHRASE.split(' ').length, 'слова должны остаться на месте');
});

test('чат: двое на 100 % понимают друг друга', () => {
  const { world, clock, inbox, join } = makeWorld();
  const a = join('Ведун');
  const b = join('Ведунья');
  world.degradationOf(a)!.grow(100);
  world.degradationOf(b)!.grow(100);
  clock.now = 10_000;
  world.chat(a, PHRASE);
  assert.equal(heard(inbox, b), PHRASE);
});

test('чат: зелье сближает — считается текущая деградация', () => {
  const { world, clock, inbox, join } = makeWorld();
  const author = join('Трезвый');
  const drunk = join('Выпивший');
  world.degradationOf(drunk)!.grow(30);
  world.degradationOf(drunk)!.drink(25);
  clock.now = 10_000;
  world.chat(author, PHRASE);
  assert.equal(heard(inbox, drunk), PHRASE);
});
