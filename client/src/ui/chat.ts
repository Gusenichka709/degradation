import { cleanChatText } from '@game/shared';

const MAX_LINES = 60;

export type ChatKind = 'chat' | 'self' | 'system';

/** Чат внизу слева. Enter — начать писать, Enter — отправить, Esc — передумать. */
export class ChatBox {
  onSend: ((text: string) => void) | null = null;

  private readonly root = document.getElementById('chat') as HTMLDivElement;
  private readonly log = document.getElementById('chat-log') as HTMLDivElement;
  private readonly input = document.getElementById('chat-input') as HTMLInputElement;

  constructor() {
    window.addEventListener('keydown', (event) => {
      if (this.root.hidden || this.typing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        this.input.focus();
      }
    });

    this.input.addEventListener('keydown', (event) => {
      // Не даём игре увидеть буквы, которые печатаются в чат (иначе W двигало бы персонажа).
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        const text = cleanChatText(this.input.value);
        if (text) this.onSend?.(text);
        this.input.value = '';
        this.input.blur();
      } else if (event.key === 'Escape') {
        this.input.value = '';
        this.input.blur();
      }
    });
  }

  /** Игрок сейчас печатает в чат. */
  get typing(): boolean {
    return document.activeElement === this.input;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  add(kind: ChatKind, text: string, name?: string): void {
    const line = document.createElement('div');
    line.className = `line ${kind}`;
    if (name) {
      const who = document.createElement('span');
      who.className = 'name';
      who.textContent = `${name}: `;
      line.append(who);
    }
    // textContent, а не innerHTML: никакой HTML из чужих сообщений не выполнится.
    line.append(document.createTextNode(text));
    this.log.append(line);
    while (this.log.childElementCount > MAX_LINES) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}
