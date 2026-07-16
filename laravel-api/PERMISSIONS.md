# Permissions dans Laravel (alignées front)

Les permissions sont gérées par **rôle** : chaque rôle possède une liste de codes de permission (table `roles`, colonne `permissions` JSON). Si un rôle n’a pas d’entrée en base, des **permissions par défaut** sont appliquées selon le code du rôle (SUPER_ADMIN, DIRECTEUR_GENERAL, SECRETAIRE, etc.).

## Fichiers

| Fichier | Rôle |
|--------|------|
| `app/Permissions/Permission.php` | Constantes des codes (VOIR_COURRIERS, CREER_COURRIER, etc.) |
| `app/Services/PermissionService.php` | `getPermissionsForUser()`, `hasPermission()`, cache par rôle |
| `app/Providers/AuthServiceProvider.php` | Définition des **Gates** (une Gate par permission, nom kebab-case) |
| `app/Http/Middleware/CheckPermission.php` | Middleware optionnel `permission:voir-courriers` |

## Enregistrement du provider et du middleware

### AuthServiceProvider

Dans un projet Laravel complet, enregistrer le provider dans `bootstrap/providers.php` (Laravel 11) ou `config/app.php` :

**Laravel 11** (`bootstrap/providers.php`) :
```php
return [
    App\Providers\AppServiceProvider::class,
    App\Providers\AuthServiceProvider::class,  // ajouter
];
```

**Laravel 10 / config/app.php** :
```php
'providers' => [
    // ...
    App\Providers\AuthServiceProvider::class,
],
```

### Middleware (optionnel)

Pour utiliser `middleware('permission:voir-courriers')` dans les routes, enregistrer l’alias dans `bootstrap/app.php` (Laravel 11) :

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'permission' => \App\Http\Middleware\CheckPermission::class,
    ]);
})
```

Ou dans `app/Http/Kernel.php` (Laravel 10) :

```php
protected $middlewareAliases = [
    'permission' => \App\Http\Middleware\CheckPermission::class,
];
```

## Utilisation dans les contrôleurs

Les contrôleurs utilisent `$this->authorize('nom-de-la-gate')` :

- **Courriers** : `voir-courriers`, `creer-courrier`, `modifier-courrier`, `supprimer-courrier`
- **Assignations** : `voir-courriers`, `assigner-courrier`
- **Annotations / Workflow / Rappels** : `voir-courriers`, `modifier-courrier`, `creer-workflow`, `modifier-workflow`
- **Utilisateurs** : `voir-utilisateurs`, `creer-utilisateur`, `modifier-utilisateur`, `supprimer-utilisateur`
- **Rôles** : `voir-roles`, `creer-role`, `modifier-role`, `supprimer-role`
- **Départements / Entités** : `voir-departements`, `creer-departement`, `modifier-departement`, `supprimer-departement`
- **Config** : `voir-roles` (lecture), `modifier-permissions` (écriture)

La Gate est le code permission en **kebab-case** (ex. `VOIR_COURRIERS` → `voir-courriers`).

## Permissions par défaut selon le rôle

Si la table `roles` ne contient pas d’entrée pour le code du rôle de l’utilisateur, les permissions suivantes sont utilisées :

| Rôle | Permissions par défaut |
|------|-------------------------|
| SUPER_ADMIN, DIRECTEUR_GENERAL | Toutes |
| SECRETAIRE | VOIR_COURRIERS, CREER_COURRIER, MODIFIER_COURRIER, ASSIGNER_COURRIER, FILTRER_* |
| DIRECTEUR | VOIR_COURRIERS, MODIFIER_COURRIER, ASSIGNER_COURRIER, VOIR_UTILISATEURS, CREER/MODIFIER_WORKFLOW, FILTRER_* |
| CHEF_SERVICE | VOIR_COURRIERS, MODIFIER_COURRIER, ASSIGNER_COURRIER, VOIR_UTILISATEURS, FILTRER_* |
| AGENT | VOIR_COURRIERS, MODIFIER_COURRIER |

Dès qu’un rôle est défini en base (table `roles`, colonne `permissions` = tableau de codes), ce sont **ces** permissions qui sont utilisées (et mises en cache).

## Endpoint : permissions de l’utilisateur connecté

**GET /api/auth/permissions** (avec `Authorization: Bearer <token>`)

Retourne la liste des codes de permission de l’utilisateur connecté (pour le front).

Exemple de réponse :
```json
{
  "data": ["VOIR_COURRIERS", "CREER_COURRIER", "MODIFIER_COURRIER", ...]
}
```

## Cache

Les permissions par rôle sont mises en cache (TTL 5 min). Lors d’une mise à jour ou suppression d’un rôle, le cache de ce rôle est invalidé dans `RolesController` via `PermissionService::clearRoleCache($code)`.
