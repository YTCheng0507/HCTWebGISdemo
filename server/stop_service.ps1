# 1. 關閉具有 WebGIS_Server 標題之視窗與其子程序
taskkill /fi "WINDOWTITLE eq WebGIS_Server*" /f /t 2>$null

# 2. 終止所有佔用 Port 8090 之程序
Get-NetTCPConnection -LocalPort 8090 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# 3. 確保所有執行 analysis_service.py 的 Python 程序皆已關閉
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*analysis_service.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
