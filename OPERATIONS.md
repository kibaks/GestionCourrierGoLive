# Exploitation et retour arrière

## Services
API Laravel 12, MariaDB, PHP-FPM et Caddy. Un worker supervisé exécute la file database des communications. Chaque couple notification/canal possède une entrée unique dans le journal d’envoi. Le worker revérifie les préférences et l’activation du canal au moment du traitement.

Une communication en échec ou restée « sending » exige une vérification fournisseur : une réponse réseau perdue ne prouve pas l’absence de livraison. Il n’y a pas de relance aveugle susceptible de multiplier les SMS. Le journal distingue acceptation du transport et réception effective, qui dépendrait de callbacks fournisseur authentifiés.

## Sauvegardes sur le serveur
`ops/backup.sh` sauvegarde la base et l’application, hors vendor/node_modules et métadonnées Git, avec permissions privées et sommes SHA-256. Sept sauvegardes quotidiennes complètes sont conservées. Le fichier .env et APP_KEY sont inclus : sauvegardes réservées à l’administrateur du serveur. Les dépendances sont reconstructibles depuis les fichiers lock ; les anciens vendor sont aussi conservés dans le répertoire de retour arrière de cette livraison.

Une sauvegarde locale ne protège pas contre la destruction de l’instance elle-même. Le choix de conserver les sauvegardes sur le serveur a été explicitement demandé. Les sauvegardes ne remplacent pas une validation de cohérence des fichiers pendant une activité concurrente importante.

`ops/health.py` relève l’API, la base, les services, l’espace libre et la dernière sauvegarde. Le contrôle est affiché dans Paramètres → État et sauvegardes. Aucune notification externe de supervision n’est envoyée automatiquement.

## Restauration
Avant une restauration, identifier le point voulu et vérifier SHA256SUMS. Restaurer d’abord dans une base de recette terminant par `_test`, avec une extraction des fichiers dans un répertoire isolé. Vérifier courriers, références, fichiers, utilisateurs et clés. Une restauration de production écrase potentiellement les écritures plus récentes : elle exige une décision explicite.

## Retour arrière applicatif
Arrêter le worker et le serveur applicatif ; conserver base et fichiers actuels ; remettre les sources/index et le vendor de la sauvegarde précédant la livraison ; reconstruire les caches de configuration/routes ; redémarrer PHP et le serveur. Les nouvelles tables et les attributions de numérotation restent en base. Ne pas supprimer les références ou effectuer un rollback destructif des migrations. Conserver les jobs en attente pour reprise après rétablissement de leur version compatible.

## Domaine et communications
Le domaine stable reste à fournir/configurer. La protection Caddy demeure active. Les identifiants SMTP et Twilio sont dans la configuration chiffrée de la base et n’appartiennent pas au dépôt Git. L’activation des canaux et les tests d’envoi réels sont des opérations distinctes du déploiement du code.
