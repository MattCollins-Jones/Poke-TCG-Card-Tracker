@echo off
echo Starting Pokemon Tracker...

:: Start backend
cd /d "%~dp0server"
start "Pokemon Tracker - Backend" cmd /k "node index.js"

:: Wait a moment for backend to initialise
timeout /t 3 /nobreak >nul

:: Start frontend
cd /d "%~dp0client"
start "Pokemon Tracker - Frontend" cmd /k "npm run dev"

echo.
echo Servers starting in separate windows.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Close the two server windows to stop the app.
pause
