/** Плашка сверху по центру: «Переподключаюсь…» и подобное. */
export class StatusBar {
  private readonly root = document.getElementById('status') as HTMLDivElement;

  show(text: string): void {
    this.root.textContent = text;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}

/** Предупреждения про картинки: неверный размер, не загрузилась и т. п. Закрывается щелчком. */
export class Warnings {
  private readonly root = document.getElementById('warnings') as HTMLDivElement;

  constructor() {
    this.root.addEventListener('click', () => {
      this.root.hidden = true;
    });
  }

  show(lines: string[]): void {
    this.root.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = 'С картинками что-то не так:';
    this.root.append(title);
    for (const line of lines) {
      const item = document.createElement('div');
      item.textContent = `• ${line}`;
      this.root.append(item);
    }
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Размеры — в docs/ART_GUIDE.md. Щёлкни, чтобы закрыть.';
    this.root.append(hint);
    this.root.hidden = false;
  }
}
