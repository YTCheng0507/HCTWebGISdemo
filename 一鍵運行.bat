@echo off
title 人行環境 WebGIS 平台服務 (Port 8090)
cd /d "%~dp0"

echo ========================================================================
echo        人行環境 WebGIS 資料平台 - 一鍵啟動精靈
echo ========================================================================
echo.

:: 1. 檢查並清理舊有殘留服務 (避免 Port 8090 被佔用)
echo [*] 正在檢查通訊埠 (Port 8090)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\stop_service.ps1" >nul 2>&1

:: 2. 偵測 Python 運行環境
set PYTHON_QGIS="C:\Program Files\QGIS 4.2.2\bin\python-qgis.bat"

if exist %PYTHON_QGIS% (
    echo [OK] 偵測到 QGIS Python 環境: %PYTHON_QGIS%
    set PYTHON_CMD=%PYTHON_QGIS%
) else (
    echo [!] 嘗試使用系統預設 python...
    set PYTHON_CMD=python
)

:: 3. 啟動後端空間分析伺服器 (Port 8090)
echo.
echo [*] 正在啟動空間分析伺服器，就緒後將由系統自動開啟瀏覽器...
echo [提示] 平台運行期間請保持此視窗開啟；若欲關閉平台，直接關閉視窗或執行「一鍵關閉.bat」即可。
echo ========================================================================
echo.

call %PYTHON_CMD% "%~dp0server\analysis_service.py" 8090

pause
