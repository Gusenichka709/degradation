/** Сильнее всего шкала глючит на пороге 45 % (номер 5); дальше её всё равно нет. */
const MAX_GLITCH = 5;

/**
 * Шкала деградации справа вверху. Число присылает сервер — уже с враньём, настоящего клиент не знает.
 * Клиент только рисует помехи по номеру порога: чем он выше, тем сильнее шкала дрожит, мигает и плывёт.
 */
export class MindBar {
  private readonly root = document.getElementById('mind') as HTMLDivElement;
  private readonly value = document.getElementById('mind-value') as HTMLSpanElement;
  private readonly fill = document.getElementById('mind-fill') as HTMLDivElement;
  private active = false;
  private shown: number | null = null;

  /** Вошли в мир: шкала может появиться. */
  show(): void {
    this.active = true;
    this.render();
  }

  hide(): void {
    this.active = false;
    this.render();
  }

  update(band: number, shown: number | null): void {
    this.shown = shown;
    this.root.className = `glitch-${Math.min(band, MAX_GLITCH)}`;
    this.render();
  }

  private render(): void {
    const shown = this.shown;
    this.root.hidden = !this.active || shown === null;
    if (shown === null) return;
    this.value.textContent = `${String(shown).replace('-', '−')} %`;
    this.fill.style.width = `${Math.min(100, Math.max(0, shown))}%`;
  }
}
