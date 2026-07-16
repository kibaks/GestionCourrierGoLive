# Script PowerShell pour commit et push automatique
# Usage: .\commit-and-push.ps1 "Message du commit"
# Le token GitHub est configuré dans l'URL du remote

param(
    [Parameter(Mandatory=$false)]
    [string]$Message = "Auto-commit: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

# Vérifier que le remote est configuré avec le token
$remoteUrl = git remote get-url origin
if ($remoteUrl -notmatch '@github\.com') {
    Write-Host "⚠️ Avertissement: Le remote origin ne semble pas contenir de token d'authentification." -ForegroundColor Yellow
    Write-Host "💡 Configurez avec: git remote set-url origin https://TOKEN@github.com/user/repo.git" -ForegroundColor Yellow
}

Write-Host "🔄 Vérification de l'état du dépôt..." -ForegroundColor Cyan

# Vérifier si on est dans un dépôt Git
if (-not (Test-Path .git)) {
    Write-Host "❌ Erreur: Ce répertoire n'est pas un dépôt Git!" -ForegroundColor Red
    exit 1
}

# Afficher l'état
git status --short

# Vérifier s'il y a des modifications
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "✅ Aucune modification à committer." -ForegroundColor Green
    
    # Vérifier s'il y a des commits non poussés
    git fetch origin --quiet
    $localCommits = git log origin/main..HEAD --oneline
    if ($localCommits) {
        Write-Host "📤 Des commits locaux doivent être poussés..." -ForegroundColor Yellow
        Write-Host "Commits à pousser:" -ForegroundColor Yellow
        Write-Host $localCommits
        Write-Host "`n🚀 Poussage vers origin/main..." -ForegroundColor Cyan
        
        $maxRetries = 3
        $retryCount = 0
        $pushSuccess = $false
        
        while ($retryCount -lt $maxRetries -and -not $pushSuccess) {
            if ($retryCount -gt 0) {
                Write-Host "🔄 Nouvelle tentative ($retryCount/$maxRetries)..." -ForegroundColor Yellow
                Start-Sleep -Seconds 2
            }
            
            git push origin main
            if ($LASTEXITCODE -eq 0) {
                $pushSuccess = $true
                Write-Host "✅ Push réussi!" -ForegroundColor Green
            } else {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-Host "⚠️ Échec du push, nouvelle tentative dans 2 secondes..." -ForegroundColor Yellow
                } else {
                    Write-Host "❌ Erreur lors du push après $maxRetries tentatives!" -ForegroundColor Red
                    Write-Host "💡 Vérifiez votre connexion et essayez manuellement: git push origin main" -ForegroundColor Yellow
                    exit 1
                }
            }
        }
    } else {
        Write-Host "✅ Tout est à jour, rien à pousser." -ForegroundColor Green
    }
    exit 0
}

# Ajouter tous les fichiers modifiés
Write-Host "`n📦 Ajout des fichiers modifiés..." -ForegroundColor Cyan
git add -A

# Vérifier ce qui a été ajouté
$staged = git diff --cached --name-only
if ($staged) {
    Write-Host "Fichiers à committer:" -ForegroundColor Yellow
    $staged | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    
    # Créer le commit
    Write-Host "`n💾 Création du commit..." -ForegroundColor Cyan
    Write-Host "Message: $Message" -ForegroundColor Gray
    git commit -m $Message
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Commit créé avec succès!" -ForegroundColor Green
        
        # Pousser vers le dépôt distant avec retry
        Write-Host "`n🚀 Poussage vers origin/main..." -ForegroundColor Cyan
        $maxRetries = 3
        $retryCount = 0
        $pushSuccess = $false
        
        while ($retryCount -lt $maxRetries -and -not $pushSuccess) {
            if ($retryCount -gt 0) {
                Write-Host "🔄 Nouvelle tentative ($retryCount/$maxRetries)..." -ForegroundColor Yellow
                Start-Sleep -Seconds 2
            }
            
            git push origin main
            if ($LASTEXITCODE -eq 0) {
                $pushSuccess = $true
                Write-Host "✅ Push réussi!" -ForegroundColor Green
                Write-Host "`n📊 État final:" -ForegroundColor Cyan
                git status --short
            } else {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-Host "⚠️ Échec du push, nouvelle tentative dans 2 secondes..." -ForegroundColor Yellow
                } else {
                    Write-Host "❌ Erreur lors du push après $maxRetries tentatives!" -ForegroundColor Red
                    Write-Host "💡 Vérifiez votre connexion et essayez manuellement: git push origin main" -ForegroundColor Yellow
                    Write-Host "💡 Ou vérifiez les permissions: git remote -v" -ForegroundColor Yellow
                    exit 1
                }
            }
        }
    } else {
        Write-Host "❌ Erreur lors de la création du commit!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️ Aucun fichier à committer (peut-être ignorés par .gitignore)" -ForegroundColor Yellow
}

Write-Host "`n✅ Terminé!" -ForegroundColor Green

