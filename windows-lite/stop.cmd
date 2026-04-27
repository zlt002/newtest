@echo off
setlocal

set "SERVER_PORT=3001"
set "TARGET_PID="

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%SERVER_PORT% .*LISTENING"') do (
  set "TARGET_PID=%%p"
  goto :kill_process
)

echo [INFO] No process is listening on port %SERVER_PORT%.
exit /b 0

:kill_process
taskkill /PID %TARGET_PID% /T /F >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Failed to stop process %TARGET_PID% on port %SERVER_PORT%.
  exit /b 1
)

echo [OK] Stopped process %TARGET_PID% on port %SERVER_PORT%.
exit /b 0
