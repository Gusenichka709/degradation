import { nameError, normalizeName } from '@game/shared';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`На странице нет элемента #${id}`);
  return element as T;
}

/** Экран входа: спрашивает имя. */
export class LoginScreen {
  /** Вызывается, когда игрок ввёл нормальное имя и нажал «Войти». */
  onSubmit: ((name: string) => void) | null = null;

  private readonly root = byId<HTMLDivElement>('login');
  private readonly form = byId<HTMLFormElement>('login-form');
  private readonly input = byId<HTMLInputElement>('login-name');
  private readonly button = byId<HTMLButtonElement>('login-button');
  private readonly error = byId<HTMLParagraphElement>('login-error');
  private disconnected = false;

  constructor() {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.disconnected) {
        location.reload();
        return;
      }
      const name = normalizeName(this.input.value);
      const problem = nameError(name);
      if (problem) {
        this.showError(problem);
        return;
      }
      this.onSubmit?.(name);
    });
  }

  /** Показать экран. name — подставить в поле (например, если автовход не удался). */
  show(name?: string): void {
    if (name !== undefined) this.input.value = name;
    this.root.hidden = false;
    this.input.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  setBusy(busy: boolean): void {
    this.button.disabled = busy;
    this.button.textContent = busy ? 'Подключаюсь…' : 'Войти в мир';
  }

  showError(text: string): void {
    this.error.textContent = text;
  }

  /** Последняя линия обороны: переподключиться так и не вышло. */
  showDisconnected(): void {
    this.disconnected = true;
    this.input.disabled = true;
    this.button.disabled = false;
    this.button.textContent = 'Обновить страницу';
    this.showError('Связь с сервером потеряна, и вернуть её не вышло. Проверь, что игра запущена, и обнови страницу.');
    this.show();
  }
}
