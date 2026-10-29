import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SERVER_PORT } from '@game/shared';
import { loadBooks } from './books';
import { startServer } from './server';

const port = Number(process.env.PORT) || SERVER_PORT;
const distDir = fileURLToPath(new URL('../../client/dist/', import.meta.url));
const staticDir = existsSync(distDir) ? distDir : null;

try {
  const server = await startServer({ port, staticDir, log: (line) => console.log(line) });
  console.log(`Сервер игры запущен на порту ${server.port}.`);
  const library = loadBooks();
  console.log(`В библиотеке книг: ${library.books.length}.`);
  for (const problem of library.problems) console.warn(`Книга сломана — ${problem}`);
  console.log(
    staticDir
      ? `Открой в браузере: http://localhost:${server.port}`
      : 'Клиент не собран — в режиме разработки открой http://localhost:5173',
  );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Порт ${port} занят — наверное, сервер уже запущен в другом окне. Закрой его и попробуй снова.`);
  } else {
    console.error('Сервер не смог запуститься:', error);
  }
  process.exit(1);
}
