@echo off
title WebGIS_Shutdown
cd /d "%~dp0"

echo ========================================================================
echo        人行環境 WebGIS 資料平台 - 一鍵關閉精靈
echo ========================================================================
echo.
echo [*] 正在安全停止 WebGIS 空間分析服務與釋放通訊埠...

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\stop_service.ps1"

echo.
echo [OK] 人行環境 WebGIS 平台服務 (Port 8090) 已全數安全關閉！
echo [OK] 記憶體與網路通訊埠資源已順利釋放。
echo ========================================================================
echo.
ping 127.0.0.1 -n 3 > nul
