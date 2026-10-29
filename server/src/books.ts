import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Книга из библиотеки: кусок лора и вопрос по нему. */
export interface Book {
  /** Имя файла — по нему видно, какая книга сломана. */
  file: string;
  title: string;
  text: string;
  question: string;
  options: string[];
  /** Номер правильного варианта в options. */
  correct: number;
}

/** Папка с книгами: content/books в корне игры. */
export const BOOKS_DIR = fileURLToPath(new URL('../../content/books/', import.meta.url));

/**
 * Разбирает книгу из текстового файла. Формат (подробно — в content/books/README.md):
 *
 *   Название: Как зовут ведьм
 *
 *   Текст книги, сколько угодно абзацев.
 *
 *   Вопрос: Что значит «ведать»?
 *   - бояться
 *   * знать          ← правильный помечен звёздочкой
 *   - колдовать
 *
 * Возвращает книгу или текст ошибки по-русски.
 */
export function parseBook(file: string, source: string): Book | string {
  const lines = source.replace(/^﻿/, '').split(/\r?\n/);
  const titleLine = lines.findIndex((line) => line.trim().length > 0);
  const titleMatch = /^Название:\s*(.+)$/.exec(lines[titleLine]?.trim() ?? '');
  if (!titleMatch) return `${file}: первая строка должна начинаться с «Название:»`;

  const questionLine = lines.findIndex((line) => /^Вопрос:/.test(line.trim()));
  if (questionLine < 0) return `${file}: нет строки «Вопрос:»`;
  const question = lines[questionLine]!.trim().replace(/^Вопрос:\s*/, '');
  if (!question) return `${file}: после «Вопрос:» пусто`;

  const text = lines
    .slice(titleLine + 1, questionLine)
    .join('\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
  if (!text) return `${file}: у книги нет текста между названием и вопросом`;

  const options: string[] = [];
  let correct = -1;
  for (const line of lines.slice(questionLine + 1)) {
    const option = /^([-*])\s*(.+)$/.exec(line.trim());
    if (!option) {
      if (line.trim()) return `${file}: после вопроса непонятная строка «${line.trim()}» — варианты пишутся с «-» или «*»`;
      continue;
    }
    if (option[1] === '*') {
      if (correct >= 0) return `${file}: правильный вариант (со звёздочкой) должен быть один`;
      correct = options.length;
    }
    options.push(option[2]!.trim());
  }
  if (options.length < 2 || options.length > 4) return `${file}: вариантов ответа должно быть от 2 до 4, а их ${options.length}`;
  if (correct < 0) return `${file}: пометь правильный вариант звёздочкой «*»`;

  return { file, title: titleMatch[1]!.trim(), text, question, options, correct };
}

/** Читает все книги из папки (файлы .txt). Сломанные пропускает и перечисляет в problems. */
export function loadBooks(dir = BOOKS_DIR): { books: Book[]; problems: string[] } {
  const books: Book[] = [];
  const problems: string[] = [];
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.toLowerCase().endsWith('.txt')).sort();
  } catch {
    return { books, problems: [`Нет папки с книгами: ${dir}`] };
  }
  for (const file of files) {
    const result = parseBook(file, readFileSync(join(dir, file), 'utf8'));
    if (typeof result === 'string') problems.push(result);
    else books.push(result);
  }
  if (books.length === 0) problems.push('В библиотеке нет ни одной целой книги.');
  return { books, problems };
}
