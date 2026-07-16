# 🔧 Mode Développement - Stockage Local des Fichiers

## Problème

Firebase Storage n'est pas disponible en mode gratuit ou n'est pas activé sur votre projet. Pour tester l'application sans Firebase Storage, un mode de développement a été implémenté.

## Solution : Mode Blob avec IndexedDB

Le système détecte automatiquement si Firebase Storage est disponible. Si ce n'est pas le cas, il bascule automatiquement en mode développement qui :

1. **Utilise des URLs blob temporaires** pour l'affichage immédiat
2. **Stocke les fichiers dans IndexedDB** pour la persistance locale
3. **Conserve les métadonnées dans Firestore** (nom, taille, type, etc.)

## Activation du Mode Développement

### Option 1 : Variable d'environnement (recommandé)

Créez un fichier `.env` à la racine du projet :

```env
VITE_USE_BLOB_STORAGE=true
```

### Option 2 : localStorage

Dans la console du navigateur, exécutez :

```javascript
localStorage.setItem('use_blob_storage', 'true');
```

Puis rechargez la page.

## Fonctionnement

### Upload de fichiers

1. L'utilisateur sélectionne un fichier
2. Le système tente d'uploader dans Firebase Storage
3. Si Storage n'est pas disponible, bascule automatiquement en mode blob :
   - Crée une URL blob temporaire
   - Stocke le fichier dans IndexedDB
   - Enregistre les métadonnées dans Firestore

### Affichage des fichiers

- Les fichiers sont récupérés depuis IndexedDB si l'URL est un blob
- Les URLs blob fonctionnent normalement pour l'affichage et le téléchargement

### Limitations

⚠️ **Important** : Les URLs blob sont temporaires et ne persistent pas après :
- Rechargement de la page
- Fermeture du navigateur
- Nettoyage du cache

Cependant, les fichiers sont stockés dans IndexedDB et peuvent être récupérés automatiquement.

## Désactiver le Mode Développement

Pour revenir au mode Firebase Storage :

1. Supprimez `VITE_USE_BLOB_STORAGE=true` du fichier `.env`
2. Ou exécutez dans la console :
   ```javascript
   localStorage.removeItem('use_blob_storage');
   ```
3. Activez Firebase Storage dans la console Firebase
4. Rechargez l'application

## Vérification

Pour vérifier si vous êtes en mode développement, ouvrez la console du navigateur. Vous verrez un avertissement :

```
⚠️ Mode développement : utilisation d'URLs blob temporaires...
```

## Migration vers Firebase Storage

Une fois Firebase Storage activé :

1. Les nouveaux fichiers seront automatiquement uploadés dans Storage
2. Les anciens fichiers (blob) resteront accessibles via IndexedDB
3. Vous pouvez migrer manuellement les fichiers importants vers Storage

