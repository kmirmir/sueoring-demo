@echo off
REM 수어링 웹 앱 브라우저 열기 스크립트
echo.
echo ========================================
echo   수어링 (SueoRing) Web App
echo ========================================
echo.

REM 여러 포트 시도
echo [1/4] 포트 8081 시도...
start http://localhost:8081 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] 포트 8082 시도...
start http://localhost:8082 2>nul
timeout /t 1 /nobreak >nul

echo [3/4] 포트 19006 시도...
start http://localhost:19006 2>nul
timeout /t 1 /nobreak >nul

echo [4/4] 포트 19007 시도...
start http://localhost:19007 2>nul

echo.
echo 브라우저가 열렸습니다!
echo.
echo 만약 브라우저가 열리지 않았다면,
echo 아래 주소를 직접 브라우저에 입력하세요:
echo   - http://localhost:8081
echo   - http://localhost:8082
echo   - http://localhost:19006
echo.
pause
