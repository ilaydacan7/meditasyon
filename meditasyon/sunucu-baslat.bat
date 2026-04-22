@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Gaia meditasyon - Yerel sunucu
echo  ================================
echo  Bu dosya yalnizca siteyi http://localhost:8080 uzerinde acar.
echo  Giris / API icin ust klasorde once: npm install  sonra: npm run dev
echo.

python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo  Sunucu baslatiliyor: http://localhost:8080
    echo  Durdurmak icin bu pencerede Ctrl+C yapin.
    echo.
    start "" "http://localhost:8080"
    python -m http.server 8080
) else (
    echo  Python bulunamadi. npx serve deneniyor...
    start "" "http://localhost:8080"
    npx --yes serve -p 8080
)

pause
