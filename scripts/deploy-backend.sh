#!/usr/bin/env bash
set -e

# Déploiement du backend Laravel sur le VPS.
# Variables d'environnement (valeurs par défaut pour l'adresse indiquée) :
#   DEPLOY_HOST     : IP ou hostname du serveur (défaut: 137.184.59.184)
#   DEPLOY_USER     : utilisateur SSH (défaut: root)
#   DEPLOY_PATH     : chemin du projet Laravel sur le serveur (défaut: /var/www/laravel-api)
#   DEPLOY_BRANCH   : branche à déployer (défaut: main)
#   PHP_CMD         : commande PHP (défaut: php)
#   COMPOSER_CMD    : commande Composer (défaut: composer)
#
# Exemple :
#   DEPLOY_USER=ubuntu DEPLOY_PATH=/home/www/laravel-api ./scripts/deploy-backend.sh

DEPLOY_HOST=${DEPLOY_HOST:-137.184.59.184}
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_PATH=${DEPLOY_PATH:-/var/www/laravel-api}
DEPLOY_BRANCH=${DEPLOY_BRANCH:-main}
PHP_CMD=${PHP_CMD:-php}
COMPOSER_CMD=${COMPOSER_CMD:-composer}

if [[ -z "$DEPLOY_HOST" || -z "$DEPLOY_USER" || -z "$DEPLOY_PATH" ]]; then
  echo "Erreur : DEPLOY_HOST, DEPLOY_USER et DEPLOY_PATH doivent être définis."
  echo "Exemple : DEPLOY_USER=ubuntu DEPLOY_PATH=/var/www/laravel-api ./scripts/deploy-backend.sh"
  exit 1
fi

echo "Déploiement backend sur ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH} (branche ${DEPLOY_BRANCH})"

ssh "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
  set -e
  cd "${DEPLOY_PATH}"

  echo "--> Mise à jour du code source"
  git fetch origin
  git reset --hard "origin/${DEPLOY_BRANCH}"

  echo "--> Installation des dépendances Composer"
  ${COMPOSER_CMD} install --no-dev --optimize-autoloader --no-interaction

  echo "--> Exécution des migrations"
  ${PHP_CMD} artisan migrate --force

  echo "--> Optimisation Laravel"
  ${PHP_CMD} artisan optimize
  ${PHP_CMD} artisan config:cache
  ${PHP_CMD} artisan route:cache
  ${PHP_CMD} artisan view:cache

  echo "--> Nettoyage du cache"
  ${PHP_CMD} artisan cache:clear

  echo "--> Déploiement backend terminé"
EOF

echo "Backend déployé avec succès sur ${DEPLOY_HOST}"
