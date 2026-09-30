@echo off
rem House on the Hill - double-click to play locally (Windows).
rem Starts a small local web server with the built-in PowerShell and opens the browser.
setlocal
cd /d "%~dp0tools"
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 %*
if errorlevel 1 (
  echo.
  echo [!] The local server could not start.
  echo     You can still play by opening dist\index.html,
  echo     or the single-file build in the release folder, directly in Chrome or Edge.
  echo.
  pause
)
endlocal
