@echo off
title StreamBridge - Chat y Alertas TikTok & Kick
color 0A

echo ========================================================
echo   Iniciando StreamBridge (TikTok & Kick OBS Overlay)
echo ========================================================
echo.

cd /d "%~dp0"

echo [OK] Iniciando servidor local en el puerto 3000...
echo.
echo - Panel:   http://localhost:3000/
echo - Chat:    http://localhost:3000/chat
echo - Alertas: http://localhost:3000/alerts
echo - Viewers: http://localhost:3000/viewers
echo - Dock:    http://localhost:3000/dock
echo.
echo ========================================================
echo.

node server.js
pause
