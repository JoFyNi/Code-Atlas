@echo off
rem CodeAtlas Compile starten.
rem   - Einen Projektordner auf diese Datei ziehen, oder
rem   - doppelklicken und den Ordner eintippen bzw. hineinziehen.
rem Voraussetzungen: Python 3.8+, Claude Code (einmal im Terminal mit "claude" angemeldet), Edge oder Chrome.
setlocal
set "HERE=%~dp0"
set "PRJ=%~1"
if not defined PRJ set /p "PRJ=Projektordner: "
if defined PRJ set "PRJ=%PRJ:"=%"
if not defined PRJ (
  echo Kein Ordner angegeben.
  pause
  exit /b 1
)
if not exist "%PRJ%\" (
  echo Ordner nicht gefunden: %PRJ%
  pause
  exit /b 1
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%HERE%codeatlas_bridge.py" "%PRJ%" --desktop
) else (
  python "%HERE%codeatlas_bridge.py" "%PRJ%" --desktop
)
echo.
echo Die Bridge wurde beendet.
pause
