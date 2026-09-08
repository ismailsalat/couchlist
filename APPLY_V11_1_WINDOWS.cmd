@echo off
setlocal
cd /d "%~dp0"

REM v11 renamed the Vitest config to .mts. A ZIP merge cannot delete the old file.
if exist vitest.config.ts del /q vitest.config.ts

echo Couchlist v11.1 merge cleanup complete.
echo Now run: npm run db:deploy ^&^& npm test
endlocal
