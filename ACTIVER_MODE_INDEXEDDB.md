# 🔧 Activer le Mode IndexedDB (Sans Firebase Storage)

## Pourquoi activer le mode IndexedDB ?

Si Firebase Storage n'est pas disponible ou activé, vous pouvez forcer l'utilisation d'IndexedDB pour éviter les erreurs CORS et les tentatives d'upload vers Storage.

## Activation

### Option 1 : Variable d'environnement (Recommandé)

Créez ou modifiez le fichier `.env` à la racine du projet :

```env
VITE_USE_BLOB_STORAGE=true
```

Puis redémarrez le serveur de développement.

### Option 2 : localStorage (Rapide)

Dans la console du navigateur (F12), exécutez :

```javascript
localStorage.setItem('use_blob_storage', 'true');
```

Puis rechargez la page.

## Comportement

Une fois activé :

✅ **Le système utilisera directement IndexedDB** sans essayer Firebase Storage
✅ **Pas d'erreurs CORS** car pas de tentative d'upload vers Storage
✅ **Fichiers stockés localement** dans le navigateur
✅ **Métadonnées toujours dans Firestore** (nom, taille, type, etc.)

## Désactivation

Pour revenir au mode Firebase Storage :

1. Supprimez `VITE_USE_BLOB_STORAGE=true` du fichier `.env`
2. Ou exécutez dans la console :
   ```javascript
   localStorage.removeItem('use_blob_storage');
   ```
3. Rechargez l'application

## Vérification

Quand le mode IndexedDB est actif, vous verrez dans la console :

```
📦 Mode IndexedDB activé : stockage local des fichiers
✅ Fichier stocké dans IndexedDB (local uniquement)
```

## Note importante

⚠️ Les fichiers stockés dans IndexedDB sont **uniquement accessibles sur le même navigateur/appareil**. Si vous changez de navigateur ou d'appareil, les fichiers ne seront pas accessibles (mais les métadonnées dans Firestore le seront).

