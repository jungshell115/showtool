@echo off
chcp 65001 > nul
echo.
echo ============================================
echo   사이니지 관리 시스템 - Windows 인스톨러 빌드
echo ============================================
echo.

:: Node.js 확인
where node >nul 2>&1
if errorlevel 1 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo Node.js를 먼저 설치하세요: https://nodejs.org
    pause
    exit /b 1
)

echo [1/5] 서버 의존성 설치...
cd server
call npm install
if errorlevel 1 goto error
cd ..

echo.
echo [2/5] 클라이언트 의존성 설치...
cd client
call npm install
if errorlevel 1 goto error
cd ..

echo.
echo [3/5] 플레이어 의존성 설치...
cd player
call npm install
if errorlevel 1 goto error
cd ..

echo.
echo [4/5] Electron 의존성 설치 및 네이티브 모듈 빌드...
cd electron
call npm run install-deps
if errorlevel 1 goto error

echo.
echo [5/5] Windows 인스톨러 패키징...
call npm run build:win
if errorlevel 1 goto error
cd ..

echo.
echo ============================================
echo   ✅ 빌드 완료!
echo   📁 결과물 위치: dist-desktop\
echo      - 사이니지 관리 시스템 Setup *.exe  (인스톨러)
echo      - 사이니지 관리 시스템 *-win.zip    (포터블)
echo ============================================
echo.
explorer dist-desktop
pause
exit /b 0

:error
echo.
echo [오류] 빌드 중 오류가 발생했습니다.
cd ..
pause
exit /b 1
