@echo off
REM Applies any pending database schema changes (idempotent — safe to run
REM anytime, as often as you like). Double-click this file directly.
REM
REM Note: the backend now also runs this automatically on every startup/restart,
REM so this is only needed if you want to apply a schema change immediately
REM without restarting the server.

cd /d "%~dp0.."
python -c "from pg import init_all_tables; init_all_tables(); print('Migrations applied successfully.')"

echo.
pause
