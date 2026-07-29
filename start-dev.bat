@echo off
title Work Hours Management - Dev Server

cd /d "%~dp0"

echo ========================================
echo   Work Hours System - Quick Start
echo ========================================
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm not found. Please install Node.js and pnpm first.
    echo Run: npm install -g pnpm
    pause
    exit /b 1
)

echo [1/3] Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies, please wait...
    pnpm install
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
) else (
    echo Dependencies ready.
)

echo.
echo [2/3] Starting dev server on port 5000...
echo.

start "Next.js Dev Server" cmd /k "cd /d ""%~dp0"" && set PORT=5000 && pnpm next dev -p 5000"

echo [3/3] Opening browser in 8 seconds...
timeout /t 8 /nobreak >nul
start http://localhost:5000

echo.
echo ========================================
echo   Started successfully!
echo   URL: http://localhost:5000
echo   Close the dev server window to stop.
echo ========================================
echo.
pause
