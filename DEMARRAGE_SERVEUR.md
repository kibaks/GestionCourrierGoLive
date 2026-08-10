# Démarrer le serveur API Laravel

**Laravel est installé dans ce dossier** (`laravel-api`) : le squelette (composer.json, artisan, bootstrap/, public/, config/) est en place.

## Démarrer l’API

1. **Installer les dépendances** (obligatoire en premier, crée le dossier `vendor/`) :

   ```bash
   cd laravel-api
   composer install
   ```
   Attendez la fin du téléchargement (1 à 2 min). Sans cette étape, `php artisan key:generate` et les autres commandes échouent avec « Failed opening vendor/autoload.php ».

2. **Configurer** (si pas déjà fait) :

   ```bash
   copy .env.example .env
   php artisan key:generate
   php artisan jwt:secret
   ```

   Éditer `.env` : `DB_PORT=3306`, `DB_USERNAME=root`, `DB_PASSWORD=` (vide si pas de mot de passe).

3. **Lancer le serveur** :

   ```bash
   php artisan serve
   ```
   Pour les pièces jointes volumineuses : `php -c php.ini artisan serve` (voir section 413 ci-dessous).

L’API sera disponible sur **http://localhost:8000**.

## Erreur 413 (Content Too Large) à l’enregistrement d’un courrier

Si l’upload de fichiers renvoie **413** ou **PostTooLargeException** :

- Lancez l’API avec le `php.ini` du projet : `php -c php.ini artisan serve` (depuis le dossier `laravel-api`).
- Ou augmentez dans votre **php.ini** système : `post_max_size = 128M` et `upload_max_filesize = 128M`, puis redémarrez le serveur.
- La **taille max par fichier** est configurable dans l'application : **Paramètres > Import de fichiers** (ex. 100 Mo). Elle doit rester inférieure ou égale à `upload_max_filesize`. Les images peuvent être compressées automatiquement avant envoi.

## PHP ou Composer introuvable

Si Windows indique que `php` ou `composer` n’est pas reconnu :

- Vérifiez que **PHP** et **Composer** sont installés et que leur dossier est dans le **PATH**.
- Avec **XAMPP** : ajoutez `C:\xampp\php` au PATH.
- Avec **Laragon** : utilisez le terminal intégré ou ajoutez le dossier `php` de Laragon au PATH.
- Redémarrez le terminal (ou Cursor) après toute modification du PATH.

Pour vérifier :

```powershell
php -v
composer -V
```
