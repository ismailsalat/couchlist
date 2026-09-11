@echo off
setlocal
cd /d "%~dp0"

echo [1/5] Lint
call npm run lint || goto :fail

echo [2/5] Typecheck
call npm run typecheck || goto :fail

echo [3/5] Build
call npm run build || goto :fail

echo [4/5] Tests
call npm test || goto :fail

echo [5/5] Audit
call npm audit || goto :fail

echo.
echo Couchlist v12.4 checks passed.
exit /b 0

:fail
echo.
echo Couchlist v12.4 validation failed. See the error above.
exit /b 1
