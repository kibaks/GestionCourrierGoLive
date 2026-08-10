# Démarrer l’API Laravel

## Dossier public et stockage

Laravel doit être servi avec le dossier **`public`** comme racine web. Avec `php artisan serve` (ou `./serve.sh`), c’est automatique : le serveur utilise déjà `public` comme point d’entrée.

- Si vous utilisez **Apache ou Nginx**, configurez le **DocumentRoot** sur :  
  `chemin/vers/laravel-api/public`
- Pour que les fichiers dans `storage/app/public` soient accessibles par URL (ex. `/storage/...`), créez le lien symbolique une fois :  
  `php artisan storage:link`  
  (crée `public/storage` → `storage/app/public`)

---

## Problème de droits (permissions)

Exécutez une fois : `./fix-droits.sh`  
Si besoin : `chmod -R 777 storage bootstrap/cache`  
Puis : `./serve.sh`

---

## Erreur « Unable to create temporary file »

Si vous voyez :

```text
PHP Warning: Unable to create temporary file, Check permissions in temporary files directory.
```

PHP utilise par défaut le répertoire temporaire système, qui peut être inaccessible (droits, chemin).

### Solution : utiliser le script `serve.sh`

À la place de :

```bash
php artisan serve
```

lancez :

```bash
./serve.sh
```

Le script :

- crée `storage/app/upload_tmp` si besoin ;
- démarre PHP avec ce dossier comme répertoire temporaire ;
- supprime l’erreur liée au répertoire temporaire.

Options possibles : `./serve.sh --port=8080`

### Alternative (sans script)

Vous pouvez aussi lancer PHP en indiquant le répertoire temporaire à la main :

```bash
cd laravel-api
mkdir -p storage/app/upload_tmp
php -d upload_tmp_dir="$(pwd)/storage/app/upload_tmp" artisan serve
```

---

## Un seul Directeur général

L’application n’autorise qu’**un seul** utilisateur avec le rôle **Directeur général** (DIRECTEUR_GENERAL).

- Lors d’un **seed complet** (`php artisan db:seed`), un seul DG est créé (utilisateur de démo) et le seeder `UnSeulDirecteurGeneralSeeder` est exécuté à la fin pour repasser les éventuels doublons en AGENT.
- Pour **nettoyer la base** sans tout réensemencer (garder un seul DG, les autres passent en AGENT) :

```bash
cd laravel-api
php artisan db:seed --class=UnSeulDirecteurGeneralSeeder
```

Le seeder conserve le premier DG trouvé (tri par email) et passe tous les autres en AGENT.
