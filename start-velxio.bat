@echo off
rem ============================================================
rem  Запуск симулятора velxio — СКРЫТО, без окон
rem  Бэкенд FastAPI  : http://127.0.0.1:8001  (/health)
rem  Фронтенд (Vite) : http://localhost:5173  (по LAN: http://<IP-ПК>:5173)
rem  Логи: _сим-бэкенд.log / _сим-фронтенд.log рядом со скриптом
rem ============================================================
chcp 65001 >nul
set "VROOT=%~dp0"
powershell -NoProfile -Command "Start-Process -FilePath '%VROOT%backend\venv\Scripts\python.exe' -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8001' -WorkingDirectory '%VROOT%backend' -WindowStyle Hidden -RedirectStandardOutput '%VROOT%_сим-бэкенд.log' -RedirectStandardError '%VROOT%_сим-бэкенд-err.log'"
powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev -- --host 0.0.0.0' -WorkingDirectory '%VROOT%frontend' -WindowStyle Hidden -RedirectStandardOutput '%VROOT%_сим-фронтенд.log' -RedirectStandardError '%VROOT%_сим-фронтенд-err.log'"
echo velxio запускается скрыто (без окон)...
echo   Симулятор:  http://localhost:5173
echo   Бэкенд:     http://127.0.0.1:8001/health
echo Остановить: stop-velxio.bat
