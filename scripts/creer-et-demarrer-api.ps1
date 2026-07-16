# Script : créer un projet Laravel complet (api-laravel) à partir de laravel-api,
# puis afficher la commande pour lancer le serveur.
# Usage : .\scripts\creer-et-demarrer-api.ps1
# À exécuter depuis la racine du projet GestionCourrier.

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$laravelApiDir = Join-Path $rootDir "laravel-api"
$apiLaravelDir = Join-Path $rootDir "api-laravel"

function Find-PhpPath {
    $paths = @(
        "php",
        "C:\laragon\bin\php\php-8.2.0-Win32-vs16-x64\php.exe",
        "C:\laragon\bin\php\php-8.1.0-Win32-vs16-x64\php.exe",
        "C:\xampp\php\php.exe",
        "C:\php\php.exe"
    )
    foreach ($p in $paths) {
        if ($p -eq "php") {
            try {
                $null = Get-Command php -ErrorAction Stop
                return "php"
            } catch { continue }
        }
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Find-ComposerPath {
    try {
        $null = Get-Command composer -ErrorAction Stop
        return "composer"
    } catch { }
    $composer = Join-Path $env:APPDATA "Composer\vendor\bin\composer.bat"
    if (Test-Path $composer) { return $composer }
    return $null
}

Write-Host "=== Preparation API Laravel (Gestion Courrier) ===" -ForegroundColor Cyan
Write-Host ""

$phpExe = Find-PhpPath
$composerExe = Find-ComposerPath

if (-not $composerExe) {
    Write-Host "Composer n'est pas trouve dans le PATH." -ForegroundColor Red
    Write-Host "Installez Composer : https://getcomposer.org/download/" -ForegroundColor Yellow
    Write-Host "Ou utilisez l'option B (manuel) dans laravel-api/DEMARRAGE_SERVEUR.md" -ForegroundColor Yellow
    exit 1
}

if (-not $phpExe) {
    Write-Host "PHP n'est pas trouve dans le PATH." -ForegroundColor Red
    Write-Host "Ajoutez le dossier de php.exe au PATH (XAMPP, Laragon, etc.)" -ForegroundColor Yellow
    Write-Host "Voir laravel-api/DEMARRAGE_SERVEUR.md" -ForegroundColor Yellow
    exit 1
}

Write-Host "PHP  : $phpExe" -ForegroundColor Green
Write-Host "Composer : $composerExe" -ForegroundColor Green
Write-Host ""

if (Test-Path $apiLaravelDir) {
    $hasArtisan = Test-Path (Join-Path $apiLaravelDir "artisan")
    if ($hasArtisan) {
        Write-Host "Le projet api-laravel existe deja. Pour lancer le serveur :" -ForegroundColor Green
        Write-Host ""
        Write-Host "  cd api-laravel" -ForegroundColor White
        Write-Host "  $phpExe artisan serve" -ForegroundColor White
        Write-Host ""
        Write-Host "L'API sera sur http://localhost:8000" -ForegroundColor Cyan
        exit 0
    }
    Write-Host "Le dossier api-laravel existe mais ne contient pas artisan. Suppression..." -ForegroundColor Yellow
    Remove-Item -Path $apiLaravelDir -Recurse -Force
}

Push-Location $rootDir
try {
    Write-Host "Creation du projet Laravel (api-laravel)..." -ForegroundColor Cyan
    & $composerExe create-project laravel/laravel api-laravel --no-interaction --prefer-dist
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erreur lors de composer create-project." -ForegroundColor Red
        exit 1
    }

    Write-Host "Copie du contenu de laravel-api dans api-laravel..." -ForegroundColor Cyan
    Copy-Item -Path "$laravelApiDir\*" -Destination $apiLaravelDir -Recurse -Force

    Push-Location $apiLaravelDir
    try {
        Write-Host "Installation JWT (tymon/jwt-auth)..." -ForegroundColor Cyan
        & $composerExe require tymon/jwt-auth --no-interaction
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Erreur composer require tymon/jwt-auth." -ForegroundColor Red
            exit 1
        }

        if (-not (Test-Path ".env")) {
            Copy-Item ".env.example" ".env"
        }
        Write-Host "Generation APP_KEY..." -ForegroundColor Cyan
        & $phpExe artisan key:generate --force
        Write-Host "Generation JWT_SECRET..." -ForegroundColor Cyan
        & $phpExe artisan jwt:secret --force
    } finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "=== Termine ===" -ForegroundColor Green
    Write-Host "Pour demarrer l'API :" -ForegroundColor Cyan
    Write-Host "  cd api-laravel" -ForegroundColor White
    Write-Host "  $phpExe artisan serve" -ForegroundColor White
    Write-Host ""
    Write-Host "Puis configurez .env dans api-laravel (DB_*, APP_URL)." -ForegroundColor Yellow
    Write-Host "L'API sera sur http://localhost:8000" -ForegroundColor Cyan
} finally {
    Pop-Location
}
