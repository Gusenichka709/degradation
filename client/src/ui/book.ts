function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`На странице нет элемента #${id}`);
  return element as T;
}

/**
 * Книга из библиотеки: текст, вопрос и варианты ответа. Всё уже искажено сервером по деградации,
 * какой ответ правильный, клиент не знает. 1, 2, 3 или щелчок — ответить, Esc — закрыть.
 */
export class BookView {
  /** Игрок выбрал вариант (номер с нуля). */
  onAnswer: ((choice: number) => void) | null = null;

  private readonly root = byId<HTMLDivElement>('book');
  private readonly title = byId<HTMLHeadingElement>('book-title');
  private readonly text = byId<HTMLDivElement>('book-text');
  private readonly question = byId<HTMLParagraphElement>('book-question');
  private readonly options = byId<HTMLDivElement>('book-options');

  constructor() {
    // Ловим клавиши раньше игры и чата: пока книга открыта, персонаж стоит, чат не открывается.
    window.addEventListener(
      'keydown',
      (event) => {
        if (!this.isOpen) return;
        event.stopPropagation();
        if (event.key === 'Escape') {
          this.hide();
          return;
        }
        const choice = Number(event.key) - 1;
        if (Number.isInteger(choice) && choice >= 0 && choice < this.options.childElementCount) this.answer(choice);
      },
      true,
    );
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(book: { title: string; text: string; question: string; options: string[] }): void {
    this.title.textContent = book.title;
    // Абзацы — через textContent: никакой HTML из книги не выполнится.
    this.text.replaceChildren(
      ...book.text.split(/\n{2,}/).map((part) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = part;
        return paragraph;
      }),
    );
    this.question.textContent = book.question;
    this.options.replaceChildren(
      ...book.options.map((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${index + 1}. ${option}`;
        button.addEventListener('click', () => this.answer(index));
        return button;
      }),
    );
    this.root.hidden = false;
    this.root.scrollTop = 0;
  }

  hide(): void {
    this.root.hidden = true;
  }

  private answer(choice: number): void {
    this.hide();
    this.onAnswer?.(choice);
  }
}
