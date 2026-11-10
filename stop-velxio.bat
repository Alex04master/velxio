@echo off
rem Остановка velxio: бэкенд (8001) и фронтенд (5173)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001 :5173" ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul
echo velxio остановлен.
