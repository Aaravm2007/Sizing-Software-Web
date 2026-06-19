@echo off
echo Killing process on port 8001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    echo Found PID %%a
    taskkill /PID %%a /F
)
echo Done. Run start_backend.bat to restart.
pause
