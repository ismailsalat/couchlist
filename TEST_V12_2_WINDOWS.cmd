@echo off
setlocal
cd /d "%~dp0"

echo [1/6] Applying database migrations...
call npm run db:deploy || goto :fail

echo [2/6] Running lint...
call npm run lint || goto :fail

echo [3/6] Running typecheck...
call npm run typecheck || goto :fail

echo [4/6] Building...
call npm run build || goto :fail

echo [5/6] Running tests...
call npm test || goto :fail

echo [6/6] Running npm audit...
call npm audit || goto :fail

echo.
echo Couchlist v12.2 checks passed.
pause
exit /b 0

:fail
echo.
echo A Couchlist v12.2 check failed. Read the error above.
pause
exit /b 1
