@echo off
rem Nutrient Atlas launcher.
rem Builds the latest version, serves it (hidden) on http://localhost:4173 and opens it in its own window.
rem Your daily data lives with this address. Development uses other ports, so work in progress never touches it.
rem Once installed as an app (Edge: "Install Nutrient Atlas"), it also opens without this server; run this again after updates.
cd /d "%~dp0"
echo Starting Nutrient Atlas (building the latest version)...

rem Restart any running copy so the fresh build is served.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -WorkingDirectory '%~dp0' bun -ArgumentList 'run','app'"

for /l %%i in (1,1,90) do (
  curl -s -o nul http://localhost:4173/ && goto open
  timeout /t 1 /nobreak >nul
)
echo Could not start the app. Run "bun run app" in this folder to see the error.
pause
exit /b 1

:open
start "" msedge --app=http://localhost:4173/
