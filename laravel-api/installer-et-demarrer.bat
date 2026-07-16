@echo off
chcp 65001 >nul
echo === Installation API Laravel (Gestion Courrier) ===
echo.

cd /d "%~dp0"

if not exist "vendor\autoload.php" (
    echo [1/4] Installation des dependances Composer...
    call composer install --no-interaction
    if errorlevel 1 (
        echo ERREUR: composer install a echoue.
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/4] vendor/ existe deja, on passe a la config.
    echo.
)

if not exist ".env" (
    echo [2/4] Copie .env.example vers .env...
    copy .env.example .env
    echo.
)

echo [3/4] Generation APP_KEY...
php artisan key:generate --force
if errorlevel 1 (
    echo ERREUR: key:generate a echoue.
    pause
    exit /b 1
)
echo.

echo [4/4] Generation JWT_SECRET...
php artisan jwt:secret --force
if errorlevel 1 (
    echo ERREUR: jwt:secret a echoue.
    pause
    exit /b 1
)
echo.

echo === Termine. Pour demarrer l'API : php artisan serve ===
echo.
if exist "php.ini" (
    echo Demarrage avec php.ini (upload 128M)...
    php -c php.ini artisan serve
) else (
    php artisan serve
)
pause
