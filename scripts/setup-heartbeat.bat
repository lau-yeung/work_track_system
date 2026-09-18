@echo off
chcp 65001 >nul
title Supabase Heartbeat Service

cd /d "%~dp0"

echo ========================================
echo   Supabase 数据库心跳保活服务
echo ========================================
echo.

set /p SERVER_URL=请输入服务器地址（如 http://localhost:5000）: 

echo.
echo [配置] 每 12 小时向 %SERVER_URL%/api/health 发送心跳
echo.

REM Check if server is reachable first
echo [检测] 正在检查服务器连接...
curl -s -o nul -w "%%{http_code}" %SERVER_URL%/api/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 服务器无法访问，请确认服务已启动
    echo.
    choice /C YN /M "是否继续配置定时任务"
    if errorlevel 2 exit /b 0
)

echo [配置] 创建 Windows 定时任务...

REM Create a batch script that will be called by the scheduled task
(
    echo @echo off
    echo chcp 65001 ^>nul
    echo echo Heartbeat running at %%date%% %%time%%
    echo curl -s -X POST "%SERVER_URL%/api/health" ^>nul 2^>^&1
    echo echo.
    echo curl -s -X POST "%SERVER_URL%/api/health" -o "%%~dp0heartbeat.log"
    echo.
) > "%~dp0heartbeat-task.bat"

REM Register the scheduled task (every 12 hours)
schtasks /create /tn "SupabaseHeartbeat" /tr "\"%~dp0heartbeat-task.bat\"" /sc hourly /mo 12 /f

if %errorlevel% equ 0 (
    echo.
    echo [成功] 定时任务已创建！
    echo.
    echo 任务详情：
    echo   名称: SupabaseHeartbeat
    echo   频率: 每 12 小时执行一次
    echo   脚本: %~dp0heartbeat-task.bat
    echo.
    echo [测试] 立即执行一次心跳...
    curl -s -X POST "%SERVER_URL%/api/health"
    echo.
    echo.
    echo [管理] 您可以通过以下命令管理定时任务：
    echo   查看: schtasks /query /tn SupabaseHeartbeat
    echo   运行: schtasks /run /tn SupabaseHeartbeat
    echo   删除: schtasks /delete /tn SupabaseHeartbeat /f
) else (
    echo.
    echo [错误] 定时任务创建失败
    echo.
    echo 如果您使用的是 Windows 家庭版，请手动创建：
    echo   1. 打开"任务计划程序" (taskschd.msc)
    echo   2. 创建基本任务 → 触发器选"每天"
    echo   3. 操作选"启动程序"，选择 heartbeat-task.bat
)

echo.
pause
