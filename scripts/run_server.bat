@echo off
chcp 65001 > nul
echo ========================================================================
echo     🚶‍♂️ 人行環境 WebGIS 資料平台 - 快速啟動精靈
echo ========================================================================
echo.

set PYTHON_QGIS="C:\Program Files\QGIS 4.2.2\bin\python-qgis.bat"

if exist %PYTHON_QGIS% (
    echo [✓] 偵測到 QGIS Python 環境：%PYTHON_QGIS%
    echo [*] 正在啟動 WebGIS 空間分析伺服器 (Port 8090)...
    echo.
    echo 請開啟瀏覽器訪問: http://localhost:8090
    echo ========================================================================
    echo.
    call %PYTHON_QGIS% "%~dp0..\server\analysis_service.py" 8090
) else (
    echo [!] 找不到 QGIS Python，嘗試使用本機預設 python 啟動...
    python "%~dp0..\server\analysis_service.py" 8090
)

pause
