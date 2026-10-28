import { CHAT_MAX_LENGTH, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from './constants';

/** Буквы (русские и латинские), цифры, пробел, подчёркивание и дефис. */
const NAME_PATTERN = /^[A-Za-zА-Яа-яЁё0-9 _-]+$/;

/** Убирает лишние пробелы в имени. */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Что не так с именем, или null, если всё хорошо. */
export function nameError(name: string): string | null {
  if (name.length < NAME_MIN_LENGTH) return `Имя слишком короткое: минимум ${NAME_MIN_LENGTH} символа.`;
  if (name.length > NAME_MAX_LENGTH) return `Имя слишком длинное: максимум ${NAME_MAX_LENGTH} символов.`;
  if (!NAME_PATTERN.test(name)) return 'В имени можно использовать буквы, цифры, пробел, «_» и «-».';
  return null;
}

/** Чистит сообщение чата: служебные символы и лишние пробелы прочь, длина не больше лимита. */
export function cleanChatText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}
