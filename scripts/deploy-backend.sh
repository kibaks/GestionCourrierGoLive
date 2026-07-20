#!/usr/bin/env bash
set -e

# Déploiement du backend Laravel sur le VPS.
# Variables d'environnement (valeurs par défaut pour l'adresse indiquée) :
#   DEPLOY_HOST     : IP ou hostname du serveur (défaut: 137.184.59.184)
#   DEPLOY_USER     : utilisateur SSH (défaut: root)
#   DEPLOY_PATH     : chemin du projet Laravel sur le serveur (défaut: /var/www/laravel-api)
#   DEPLOY_BRANCH   : branche à déployer (défaut: main)
#   DEPLOY_STRATEGY : 'git' ou 'rsync' (défaut: git si le serveur a un repo git, sinon rsync)
#   PHP_CMD         : commande PHP (défaut: php)
#   COMPOSER_CMD    : commande Composer (défaut: composer)
#
# Exemples :
#   ./scripts/deploy-backend.sh
#   DEPLOY_USER=ubuntu DEPLOY_PATH=/home/www/laravel-api ./scripts/deploy-backend.sh

DEPLOY_HOST=${DEPLOY_HOST:-137.184.59.184}
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_PATH=${DEPLOY_PATH:-/var/www/laravel-api}
DEPLOY_BRANCH=${DEPLOY_BRANCH:-main}
PHP_CMD=${PHP_CMD:-php}
COMPOSER_CMD=${COMPOSER_CMD:-composer}
DEPLOY_STRATEGY=${DEPLOY_STRATEGY:-}

if [[ -z "$DEPLOY_HOST" || -z "$DEPLOY_USER" || -z "$DEPLOY_PATH" ]]; then
  echo "Erreur : DEPLOY_HOST, DEPLOY_USER et DEPLOY_PATH doivent être définis."
  echo "Exemple : DEPLOY_USER=ubuntu DEPLOY_PATH=/var/www/laravel-api ./scripts/deploy-backend.sh"
  exit 1
fi

# Déterminer la stratégie si non précisée
if [[ -z "$DEPLOY_STRATEGY" ]]; then
  if ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "test -d '${DEPLOY_PATH}/.git'" 2>/dev/null; then
    DEPLOY_STRATEGY='git'
  else
    DEPLOY_STRATEGY='rsync'
  fi
fi

echo "Déploiement backend sur ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH} (stratégie: ${DEPLOY_STRATEGY})"

# Mise à jour du code source
if [[ "$DEPLOY_STRATEGY" == "git" ]]; then
  echo "--> Mise à jour via git"
  ssh "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
    set -e
    cd "${DEPLOY_PATH}"
    git fetch origin
    git reset --hard "origin/${DEPLOY_BRANCH}"
EOF
else
  echo "--> Mise à jour via rsync"
  rsync -avz \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='vendor' \
    --exclude='storage' \
    --exclude='node_modules' \
    --exclude='public/storage' \
    --no-owner --no-group \
    "laravel-api/" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"
fi

# Commandes serveur
ssh "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
  set -e
  cd "${DEPLOY_PATH}"

  echo "--> Installation des dépendances Composer"
  ${COMPOSER_CMD} install --no-dev --optimize-autoloader --no-interaction

  echo "--> Exécution des migrations"
  ${PHP_CMD} artisan migrate --force

  echo "--> Lien storage/public"
  ${PHP_CMD} artisan storage:link || true

  echo "--> Optimisation Laravel"
  ${PHP_CMD} artisan optimize
  ${PHP_CMD} artisan config:cache
  ${PHP_CMD} artisan route:cache
  ${PHP_CMD} artisan view:cache

  echo "--> Nettoyage du cache"
  ${PHP_CMD} artisan cache:clear

  echo "--> Droits fichiers"
  chown -R www-data:www-data app database routes config bootstrap/cache storage 2>/dev/null || true
  chmod -R 775 storage bootstrap/cache 2>/dev/null || true

  echo "--> Déploiement backend terminé"
EOF

echo "Backend déployé avec succès sur ${DEPLOY_HOST}"
