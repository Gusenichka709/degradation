import { createReadStream, statSync, type Stats } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/**
 * Раздаёт собранный клиент (папку client/dist) — это нужно в «боевом» режиме, когда
 * сервер и страница игры живут на одном порту. В режиме разработки страницу отдаёт Vite.
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, root: string | null): void {
  if (!root) {
    sendText(
      res,
      200,
      'Сервер игры работает. Клиент не собран.\n' +
        'Для разработки: npm run dev и открой http://localhost:5173\n' +
        'Для «боевого» режима: npm run build, затем npm start.',
    );
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    sendText(res, 400, 'Плохой адрес.');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const rootDir = path.resolve(root);
  const file = path.resolve(rootDir, '.' + pathname);
  if (!file.startsWith(rootDir + path.sep)) {
    sendText(res, 403, 'Нельзя.');
    return;
  }

  let stats: Stats;
  try {
    stats = statSync(file);
  } catch {
    sendText(res, 404, 'Не найдено.');
    return;
  }
  if (!stats.isFile()) {
    sendText(res, 404, 'Не найдено.');
    return;
  }

  res.writeHead(200, {
    'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': stats.size,
  });
  createReadStream(file).pipe(res);
}
