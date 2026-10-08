@echo off
REM Build Atlas for Windows. All the steps live in scripts\build.py.
cd /d "%~dp0"
py -3 scripts\build.py %* || exit /b 1
