@echo off
echo Running npm install...
call npm install
echo.

echo Running npm build...
call npm run build
echo.

echo Build finished. Starting installer...
start "" "%~dp0dist\GitScope-Setup.exe"

exit /b
