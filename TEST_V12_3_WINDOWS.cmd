@echo off
setlocal
cd /d "%~dp0"

echo [1/6] Lint
call npm run lint || exit /b 1

echo [2/6] Typecheck
call npm run typecheck || exit /b 1

echo [3/6] Build
call npm run build || exit /b 1

echo [4/6] Tests
call npm test || exit /b 1

echo [5/6] Audit
call npm audit || exit /b 1

echo [6/6] Register Discord commands
call npm run bot:register || exit /b 1

echo.
echo Couchlist v12.3 checks passed.
