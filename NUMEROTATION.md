# Double numérotation des courriers

Déployer les migrations avant de remettre l’API en service. La migration conserve `courriers.numero` et inscrit les références existantes dans un registre permanent. Elle ne renumérote aucun courrier historique et n’attribue pas rétroactivement de numéro organisationnel.

Le numéro système est attribué côté serveur à chaque création, y compris les lots et les créations via PUT. Les références fournies par un ancien client ne remplacent plus le numéro système. Les liens internes continuent d’utiliser l’UUID. L’API conserve `numero` et ajoute `numeroSysteme`, `numeroOrganisationnel`, `entiteNumerotationId` et `numerotationSnapshot`.

Le numéro organisationnel est désactivé par défaut. Un SUPER_ADMIN configure les codes des entités et les règles dans le frontend. Les règles s’appliquent aux nouveaux courriers uniquement. L’utilisateur choisit une entité autorisée à la saisie ; la règle du niveau le plus proche s’applique, puis une éventuelle règle centrale. À niveau égal, l’ordre des règles définit leur priorité.

Les variables disponibles sont `{organisation}`, `{code}`, `{chemin}`, `{annee}`, `{mois}`, `{type}`, `{sens}`, `{compteur}`. Chaque entité utilise son propre compteur, sauf registre central. Les compteurs peuvent être partagés ou séparés par type et sens, et remis à zéro par année/mois ou jamais. Un format doit distinguer les dimensions activées pour éviter les collisions. Les numéros organisationnels sont globalement uniques dans cette application.

Le code d’entité doit être renseigné pour une règle organisationnelle ; la variable chemin nécessite aussi les codes des parents. Le snapshot conserve les codes au moment de l’attribution. Un renommage ou déplacement ultérieur ne change pas un numéro émis.

Les compteurs et le registre des attributions sont indépendants des courriers : une suppression n’autorise jamais la réutilisation du numéro. Les références sont immuables. La valeur de départ est un minimum pour le prochain numéro, pas une commande de remise à zéro. Modifier ou retirer une règle n’efface pas ses compteurs.

Toutes les insertions Eloquent passent par une transaction entourant génération, registre et insertion du courrier. Un verrou commun fixe l’ordre de mise à jour de la configuration et des compteurs. Il sérialise volontairement les attributions ; mesurer ce point avant un usage à très fort débit. Les insertions SQL directes contournent les événements Eloquent et sont réservées aux migrations contrôlées.

## API

- `GET /api/numbering/settings` : configuration et codes, SUPER_ADMIN uniquement.
- `PUT /api/numbering/settings` : publie une nouvelle version avec contrôle de version optimiste. Le client doit renvoyer `version`, `settings` et `codes`.
- `GET /api/numbering/options` : configuration de sélection et entités autorisées pour l’utilisateur.
- `POST /api/numbering/preview` : exemple pour `entityId`, `type` et `sens`. Ne réserve pas de numéro et n’annonce pas le prochain compteur réel.
- Les créations de courrier acceptent `entiteNumerotationId`. Un numéro organisationnel ne peut pas être imposé manuellement.

## Validation

`tests/numbering-integration.php` utilise une base MariaDB jetable dont le nom finit par `_test`. Le serveur HTTP de test doit charger ce même backend et cette même base sur `127.0.0.1:18082` (par exemple `php -S 127.0.0.1:18082 -t public public/index.php`). Ne jamais diriger ce port vers l’instance de production.

Après migration de la base de test, exécuter `php tests/numbering-integration.php`. Les scénarios couvrent droits, idempotence, lots, héritage, compteurs indépendants, suppression, concurrence réelle sur huit connexions, changement de période/fuseau, configuration obsolète, collision de format, séquence au-delà de 9999 et niveau d’entité personnalisé.

`tests/numbering-migration.php prepare` insère une référence historique dans une base possédant seulement les anciennes migrations. Exécuter la nouvelle migration puis `php tests/numbering-migration.php verify` pour vérifier la conservation et la reprise du registre. Les deux modes refusent une base dont le nom ne finit pas par `_test`.

## Déploiement et retour arrière

Sauvegarder base et fichiers pendant l’arrêt des écritures. Déployer l’API et ses migrations puis le frontend correspondant ; vider les caches de routes/configuration et les listes de courriers. Relancer PHP-FPM pour ne pas conserver d’ancien code en mémoire.

La migration n’a pas de rollback destructif automatique. Pour un retour applicatif, conserver les tables et colonnes de numérotation ainsi que les compteurs. Ne pas rétablir l’ancien allocateur de numéros si des références ont été émises depuis la mise à jour. Restaurer une sauvegarde complète uniquement après analyse des éventuelles nouvelles écritures.
