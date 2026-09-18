@echo off
chcp 65001 >nul
title Supabase Heartbeat - Manual Run

cd /d "%~dp0.."

if "%1"=="" (
    set SERVER_URL=http://localhost:5000
) else (
    set SERVER_URL=%1
)

echo ========================================
echo   Supabase 数据库心跳
echo ========================================
echo.

echo [1] 检查服务器连接...
for /f "tokens=*" %%i in ('curl -s -o nul -w "%%{http_code}" %SERVER_URL%/api/health') do set HTTP_CODE=%%i

if "%HTTP_CODE%"=="200" (
    echo     服务器在线
) else (
    echo [警告] 服务器返回状态码: %HTTP_CODE%
    echo     如果服务器未启动，请先运行 start-dev.bat
)

echo.
echo [2] 发送心跳请求（防止数据库休眠）...
echo     POST %SERVER_URL%/api/health
echo.

curl -s -X POST "%SERVER_URL%/api/health"

echo.
echo.
echo [3] 查看数据库健康状态...
echo     GET %SERVER_URL%/api/health
echo.

curl -s "%SERVER_URL%/api/health"

echo.
echo.
echo ========================================
echo   完成！
echo   如果数据库已被暂停，请访问 Supabase Dashboard 手动恢复：
echo   https://supabase.com/dashboard
echo ========================================
echo.
pause
