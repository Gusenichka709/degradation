import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // host: true — страницу видно и с других компьютеров в твоей сети (играть с другом по Wi-Fi).
    host: true,
    port: 5173,
    // START.cmd ставит OPEN_BROWSER=1 — тогда Vite сам откроет игру в браузере.
    open: process.env.OPEN_BROWSER === '1',
  },
  build: {
    target: 'es2022',
    // Phaser большой (около мегабайта), это нормально — не пугаемся предупреждения.
    chunkSizeWarningLimit: 2000,
  },
});
