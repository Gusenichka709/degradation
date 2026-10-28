// Проверка версии Node.js перед запуском игры: понятное сообщение вместо непонятной ошибки.
const [major, minor] = process.versions.node.split('.').map(Number);
const ok = major > 22 || (major === 22 && minor >= 12);

if (!ok) {
  console.error('');
  console.error(`  У тебя Node.js ${process.versions.node}, а игре нужен 22.12 или новее.`);
  console.error('  Скачай версию LTS с сайта nodejs.org, установи и запусти игру снова.');
  console.error('');
  process.exit(1);
}
