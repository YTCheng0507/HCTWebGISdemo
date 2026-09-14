@echo off
chcp 65001 >nul
title 推送 WebGIS 專案至 GitHub
echo ========================================================================
echo   【高雄市人本交通環境 WebGIS 平台 - GitHub 一鍵推送工具】
echo ========================================================================
echo.
echo 請先至 https://github.com/new 建立一個空白 Repository (例如: kh-sidewalk-webgis)
echo.
set /p REPO_URL=請貼上您的 GitHub 儲存庫網址 (例如 https://github.com/你的帳號/kh-sidewalk-webgis.git): 
echo.
"C:\Program Files\Git\cmd\git.exe" remote remove origin 2>nul
"C:\Program Files\Git\cmd\git.exe" remote add origin %REPO_URL%
echo [*] 正在推送到 GitHub main 分支...
"C:\Program Files\Git\cmd\git.exe" push -u origin main
echo.
echo [OK] 推送完成！請至 Render.com 進行一鍵部署。
pause