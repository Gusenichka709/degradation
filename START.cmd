@echo off
chcp 65001 >nul
title Игра про деградацию
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

node scripts\check-node.mjs
if errorlevel 1 goto fail

echo.
echo  Проверяю библиотеки. В первый раз это минута-две...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto npmfail

echo.
echo  Запускаю игру. Браузер откроется сам: http://localhost:5173
echo  Второй игрок - ещё одна вкладка с тем же адресом.
echo  Остановить игру - просто закрой это окно.
echo.
set OPEN_BROWSER=1
call npm run dev
goto end

:nonode
echo.
echo  Не найден Node.js. Сейчас откроется сайт nodejs.org:
echo  скачай версию LTS, установи и снова дважды щёлкни START.cmd.
start "" https://nodejs.org
goto fail

:npmfail
echo.
echo  npm install не сработал. Скопируй текст ошибки выше и покажи Claude.
goto fail

:fail
echo.
pause
exit /b 1

:end
pause
