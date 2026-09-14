@echo off
chcp 65001 >nul
title 一鍵部署 WebGIS 平台至 Hugging Face Spaces
echo ========================================================================
echo   【高雄市人本交通環境 WebGIS 平台 - Hugging Face Spaces 一鍵部署工具】
echo ========================================================================
echo.
echo 請準備您的 Hugging Face 資訊：
echo 1. Access Token (具備 Write 權限，前往 https://huggingface.co/settings/tokens 取得)
echo 2. Repo ID (格式如: 您的帳號名稱/kh-sidewalk-webgis)
echo.
set /p HF_TOKEN=請輸入您的 Hugging Face Token: 
set /p HF_REPO_ID=請輸入 Repo ID (例如 username/kh-sidewalk-webgis): 
echo.
echo [*] 開始執行部署與大檔案上傳...
"C:\Program Files\QGIS 4.2.2\apps\Python312\python.exe" scripts\deploy_hf.py "%HF_TOKEN%" "%HF_REPO_ID%"
echo.
pause