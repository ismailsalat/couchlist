@echo off
setlocal
cd /d "%~dp0"
echo.
echo Couchlist v12.1 validation
echo ==========================
echo.
call npm run db:deploy || goto :fail
call npm run lint || goto :fail
call npm run typecheck || goto :fail
call npm run build || goto :fail
call npm test || goto :fail
call npm audit || goto :fail
echo.
echo All local validation commands passed.
echo Start the website with:
echo   npm run dev --workspace @couchlist/web
echo.
exit /b 0
:fail
echo.
echo Validation stopped because the command above failed.
exit /b 1
