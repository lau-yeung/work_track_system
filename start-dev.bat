@echo off
chcp 65001 >nul
title Work Hours Management - Dev Server

cd /d "%~dp0"

echo ========================================
echo   工时管理系统 - 开发模式
echo ========================================
echo.

REM Check node
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未检测到 Node.js，请先安装 Node.js。
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/2] 首次安装依赖，请稍候...
    call pnpm install
    if errorlevel 1 (
        echo [ERROR] 依赖安装失败。
        pause
        exit /b 1
    )
) else (
    echo [1/2] 依赖检查完成。
)

echo.
echo [2/2] 启动开发服务器（支持热更新）...
echo.

REM 使用 next dev 直接启动，比 tsx watch 更稳定
set PORT=5000
set NODE_ENV=development
call node node_modules\next\dist\bin\next dev -p 5000

pause
