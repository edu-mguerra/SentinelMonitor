@echo off
title Sentinel Monitor - Inicializador
echo ========================================================
echo           Iniciando Sentinel Monitor
echo ========================================================
echo.

echo Iniciando Backend FastAPI (Porta 10203)...
start "Sentinel Monitor - Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 0.0.0.0 --port 10203 --reload"

echo Iniciando Frontend Next.js (Porta 3000)...
start "Sentinel Monitor - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo Servicos iniciados em janelas separadas:
echo - Backend:  http://localhost:10203/docs
echo - Frontend: http://localhost:3000
echo ========================================================
pause
