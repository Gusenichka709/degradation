import Phaser from 'phaser';
import { SERVER_PORT, type ServerMessage } from '@game/shared';
import { Net } from './net';
import { BootScene } from './scenes/BootScene';
import { WorldScene, type WorldSceneData } from './scenes/WorldScene';
import { ChatBox } from './ui/chat';
import { Hud } from './ui/hud';
import { LoginScreen } from './ui/login';
import { MindBar } from './ui/mind';
import { StatusBar, Warnings } from './ui/status';
import './style.css';

/**
 * Имя живёт в памяти вкладки (sessionStorage): после перезагрузки страницы входим сами,
 * а новая вкладка начинает с пустого поля — второй игрок не упрётся в «имя занято».
 */
const SESSION_NAME_KEY = 'degradation.name';
const JOIN_TIMEOUT_MS = 5000;
const RECONNECT_DELAY_MS = 1000;
/** Сколько раз пытаемся переподключиться (раз в секунду) — примерно две минуты. */
const RECONNECT_ATTEMPTS = 120;

/** Адрес игрового сервера. Можно подменить: ?server=ws://адрес:порт */
function serverUrl(): string {
  const custom = new URLSearchParams(location.search).get('server');
  if (custom) return custom;
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  // При разработке страницу отдаёт Vite (порт 5173), а сервер игры живёт на своём порту.
  if (import.meta.env.DEV) return `${protocol}://${location.hostname}:${SERVER_PORT}`;
  // В «боевом» режиме страницу отдаёт сам сервер игры — подключаемся туда же.
  return `${protocol}://${location.host}`;
}

function readSessionName(): string | null {
  try {
    return sessionStorage.getItem(SESSION_NAME_KEY);
  } catch {
    return null;
  }
}

function saveSessionName(name: string): void {
  try {
    sessionStorage.setItem(SESSION_NAME_KEY, name);
  } catch {
    // Браузер не даёт хранилище — просто не будет автовхода.
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const net = new Net();
const login = new LoginScreen();
const chat = new ChatBox();
const hud = new Hud();
const mind = new MindBar();
const status = new StatusBar();
const warnings = new Warnings();
let myId = 0;
let myName: string | null = null;
let reconnecting = false;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14160f',
  // Крупные чёткие пиксели при зуме камеры (новый режим Phaser 4).
  render: { smoothPixelArt: true },
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [BootScene, WorldScene],
});

type JoinReply = Extract<ServerMessage, { t: 'welcome' } | { t: 'error' }>;

/** Ждём ответа на «join»: пустили или нет. null — сервер промолчал. */
function waitForJoinReply(): Promise<JoinReply | null> {
  return new Promise((resolve) => {
    let timer = 0;
    const stop = net.on((message) => {
      if (message.t !== 'welcome' && message.t !== 'error') return;
      window.clearTimeout(timer);
      stop();
      resolve(message);
    });
    timer = window.setTimeout(() => {
      stop();
      resolve(null);
    }, JOIN_TIMEOUT_MS);
  });
}

/** Входит в мир под именем name. Возвращает текст ошибки или null, если всё получилось. */
async function enterWorld(name: string): Promise<string | null> {
  if (!net.connected) {
    try {
      await net.connect(serverUrl());
    } catch {
      return 'Сервер не отвечает. Проверь, что игра запущена: START.cmd или npm run dev.';
    }
  }

  const reply = waitForJoinReply();
  net.send({ t: 'join', name });
  const message = await reply;
  if (!message) return 'Сервер не ответил. Попробуй ещё раз.';
  if (message.t === 'error') return message.message;

  myId = message.id;
  myName = name;
  saveSessionName(name);
  login.hide();
  status.hide();
  chat.show();
  hud.show();
  mind.show();
  const data: WorldSceneData = { net, chat, hud, myId: message.id, you: message.you, tick: message.tick };
  game.scene.start('world', data);
  return null;
}

/** Связь пропала: пробуем вернуться раз в секунду под тем же именем. */
async function reconnect(): Promise<void> {
  if (reconnecting || !myName) return;
  reconnecting = true;
  let lastError = '';
  for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS; attempt++) {
    status.show(
      attempt === 1
        ? 'Связь с сервером пропала. Переподключаюсь…'
        : `Переподключаюсь… попытка ${attempt}${lastError ? ` (${lastError})` : ''}`,
    );
    await sleep(RECONNECT_DELAY_MS);
    const error = await enterWorld(myName);
    if (!error) {
      reconnecting = false;
      return;
    }
    lastError = error;
  }
  reconnecting = false;
  status.hide();
  chat.hide();
  login.showDisconnected();
}

game.events.once('assets-ready', async () => {
  const saved = readSessionName();
  if (!saved) {
    login.show();
    return;
  }
  // Страница перезагрузилась (например, Claude поправил код) — заходим сами под прежним именем.
  status.show(`Захожу как ${saved}…`);
  const error = await enterWorld(saved);
  if (error) {
    status.hide();
    login.show(saved);
    login.showError(error);
  }
});

game.events.on('assets-problems', (problems: string[]) => warnings.show(problems));

login.onSubmit = async (name) => {
  login.setBusy(true);
  login.showError('');
  const error = await enterWorld(name);
  login.setBusy(false);
  if (error) login.showError(error);
};

net.on((message) => {
  if (message.t === 'chat') chat.add(message.id === myId ? 'self' : 'chat', message.text, message.name);
  else if (message.t === 'system') chat.add('system', message.text);
  else if (message.t === 'scale') mind.update(message.band, message.shown);
});

chat.onSend = (text) => net.send({ t: 'chat', text });

net.onClose = () => {
  if (!myName) return; // ещё не в игре — возвращать некуда
  game.scene.stop('world');
  hud.hide();
  mind.hide();
  void reconnect();
};
