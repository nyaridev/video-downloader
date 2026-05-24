@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if /i not "%HIDE_CONSOLE%"=="" if /i not "%HIDE_CONSOLE%"=="0" if /i not "%HIDE_CONSOLE%"=="false" (
    if not defined _VD_CONSOLE_HIDDEN (
        powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','set _VD_CONSOLE_HIDDEN=1& call \"\"\"%~f0\"\"\"' -WindowStyle Hidden -WorkingDirectory '!CD!'"
        exit /b 0
    )
)

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python was not found. Install Python 3.10+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

if defined PYTHON (
    set "PY=%PYTHON%"
    goto :run
)

set "USE_UV=0"
where uv >nul 2>&1
if not errorlevel 1 set "USE_UV=1"

if "%USE_UV%"=="1" (
    if not exist ".venv" (
        echo Creating virtual environment with uv...
        uv venv
        if errorlevel 1 goto :fail
    )
    echo Installing locked dependencies with uv...
    uv sync --frozen 2>nul
    if errorlevel 1 (
        echo Lockfile missing or outdated, running uv sync...
        uv sync
        if errorlevel 1 goto :fail
    )
    set "PY=.venv\Scripts\python.exe"
) else (
    if not exist ".venv" (
        echo uv not found, creating venv with python -m venv...
        python -m venv .venv
        if errorlevel 1 goto :fail
    )
    set "PY=.venv\Scripts\python.exe"
    echo Installing locked dependencies with pip...
    "%PY%" -m pip install --upgrade pip -q
    "%PY%" -m pip install -r requirements.txt
    if errorlevel 1 goto :fail
)

:run
if not exist "%PY%" (
  echo [ERROR] Python executable not found: %PY%
  pause
  exit /b 1
)

echo Starting Video Downloader...
"%PY%" main.py
if errorlevel 1 (
    echo.
    echo Program exited with an error.
    pause
)
exit /b 0

:fail
echo [ERROR] Environment setup failed.
pause
exit /b 1
