@echo off
echo Running npm build...
cmd /c npm run build
echo.
echo Build finished. Starting installer...

start "" "\Users\Michael\Repositories\GitScope\dist\GitScope-Setup.exe"

exit /b
