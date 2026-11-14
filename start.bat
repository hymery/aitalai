@echo off
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"

echo [AITALAI] Project root: %ROOT%

rem Backend: activate venv, seed the database, start FastAPI.
start "AITALAI Backend" /D "%ROOT%backend" cmd.exe /k "call .venv\Scripts\activate.bat && python seed.py && python build_courses.py && uvicorn main:app --reload --port 8000"

rem Frontend: npm install checks dependencies, then starts Vite.
start "AITALAI Frontend" /D "%ROOT%frontend" cmd.exe /k "npm install --no-audit --no-fund && npm run dev"

rem Bot: start only when bot/.env contains a plausible BOT_TOKEN.
set "BOT_TOKEN_VALUE="
if exist "%ROOT%bot\.env" (
    for /f "usebackq eol=# tokens=1,2 delims==" %%A in ("%ROOT%bot\.env") do (
        if /I "%%A"=="BOT_TOKEN" set "BOT_TOKEN_VALUE=%%B"
    )
)

set "BOT_STARTED=0"
if defined BOT_TOKEN_VALUE (
    echo %BOT_TOKEN_VALUE%| findstr /R /C:"^[0-9][0-9]*:..*" >nul
    if not errorlevel 1 (
        start "AITALAI Bot" /D "%ROOT%bot" cmd.exe /k "call .venv\Scripts\activate.bat && python bot.py"
        set "BOT_STARTED=1"
    )
)

if "%BOT_STARTED%"=="0" echo [AITALAI] Bot skipped: set BOT_TOKEN in bot\.env first.

rem Wait four seconds, then open the application and Swagger in the default browser.
%SystemRoot%\System32\PING.EXE -n 5 127.0.0.1 >nul
start "" "http://localhost:5173/"
start "" "http://localhost:8000/docs"

echo [AITALAI] Started. Close the AITALAI terminal windows to stop the services.
endlocal
exit /b 0
