@echo off
chcp 65001 >nul
title Work Hours Management System

cd /d "%~dp0"

echo ========================================
echo   工时管理系统 - 启动脚本
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

REM Check if build needs refresh
if not exist ".next\BUILD_ID" (
    echo [2/2] 首次使用，正在构建生产版本...
    set "NEED_BUILD=1"
) else (
    REM Check if source files are newer than the build
    echo [2/2] 检查源码变更...
    powershell -NoProfile -Command ^
        "$buildTime = (Get-Item '.next\BUILD_ID').LastWriteTime;" ^
        "$srcTime = (Get-ChildItem -Recurse -File src,public,scripts | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime;" ^
        "if ($srcTime -gt $buildTime) { Write-Host '  检测到源码变更，需要重建'; exit 1 } else { Write-Host '  生产版本已是最新'; exit 0 }"
    if errorlevel 1 (
        set "NEED_BUILD=1"
    ) else (
        set "NEED_BUILD=0"
    )
)

if "%NEED_BUILD%"=="1" (
    echo.
    echo    清理旧构建...
    if exist ".next" rmdir /s /q ".next"
    echo    正在构建生产版本，请稍候...
    call node node_modules\next\dist\bin\next build
    if errorlevel 1 (
        echo [ERROR] 构建失败，请检查代码。
        pause
        exit /b 1
    )
    echo    构建完成。
)

echo.
echo ========================================
echo   启动生产服务器（稳定模式）
echo   访问地址: http://localhost:5000
echo   关闭此窗口即可停止服务
echo ========================================
echo.

set PORT=5000
call node node_modules\next\dist\bin\next start -p 5000

pause
