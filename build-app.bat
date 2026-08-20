@echo off
title Building GitScope...
echo Navigating to project directory...
cd /d "%~dp0"

echo Running electron-builder...
call npx electron-builder -c.npmRebuild=false

echo.
echo Build process complete. 
pause

