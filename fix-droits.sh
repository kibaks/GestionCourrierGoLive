#!/usr/bin/env bash
# Donne les droits d'écriture nécessaires à Laravel (storage, cache, répertoire temporaire).
# À lancer depuis le dossier laravel-api : ./fix-droits.sh
# En cas d'échec, essayez : chmod +x fix-droits.sh puis ./fix-droits.sh

set -e
cd "$(dirname "$0")"

echo "Correction des droits pour Laravel..."

# Créer les dossiers nécessaires
mkdir -p storage/app/upload_tmp
mkdir -p storage/app/courriers
mkdir -p storage/framework/cache/data
mkdir -p storage/framework/sessions
mkdir -p storage/framework/views
mkdir -p storage/logs
mkdir -p bootstrap/cache

# Droits d'écriture : propriétaire + groupe (775 = rwxrwxr-x)
chmod -R u+rwX storage
chmod -R u+rwX bootstrap/cache
# S'assurer que les dossiers sont traversables (X = exécution pour entrer)
find storage -type d -exec chmod 775 {} \; 2>/dev/null || true
find storage -type f -exec chmod 664 {} \; 2>/dev/null || true
chmod 775 bootstrap/cache 2>/dev/null || true

echo "OK. storage/, bootstrap/cache/ et storage/app/upload_tmp/ sont en écriture."
echo ""
echo "Relancez le serveur avec : ./serve.sh"
