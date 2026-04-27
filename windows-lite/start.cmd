@echo off
setlocal

cd /d "%~dp0"

if not exist "dist\index.html" (
  echo [ERROR] Missing dist\index.html. Run npm run build first.
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH. Install Node.js first.
  exit /b 1
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PowerShell was not found.
  exit /b 1
)

if not exist "logs" mkdir "logs"

set "SERVER_PORT=3001"
set "APP_URL=http://127.0.0.1:%SERVER_PORT%"
set "APP_HEALTH_URL=%APP_URL%/"
set "LOG_FILE=%CD%\logs\server.log"

start "" /b node server\index.js > "%LOG_FILE%" 2>&1

for /l %%i in (1,1,60) do (
  powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%APP_HEALTH_URL%' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
  if not errorlevel 1 (
    goto :open_browser
  )

  timeout /t 1 /nobreak >nul
)

echo [ERROR] Service was not ready within 60 seconds. Check logs\server.log.
exit /b 1

:open_browser
start "" "%APP_URL%"

endlocal
