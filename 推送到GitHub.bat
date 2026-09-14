@echo off
chcp 65001 >nul
title 同步 WebGIS 專案至 GitHub
echo ========================================================================
echo   【高雄市人本交通環境 WebGIS 平台 - GitHub 一鍵同步更新工具】
echo   目標儲存庫: https://github.com/YTCheng0507/HCTWebGISdemo.git
echo ========================================================================
echo.
echo [*] 正在檢查並自動提交本地異動...
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" commit -m "update: sync changes from local" 2>nul
echo [*] 正在推送至 GitHub main 分支...
"C:\Program Files\Git\cmd\git.exe" push origin main
echo.
echo ========================================================================
echo [OK] 專案已成功同步至 GitHub！
echo 若已在 Render.com 設定連動，Render 會在幾秒內自動偵測並開始重新部署。
echo ========================================================================
pause