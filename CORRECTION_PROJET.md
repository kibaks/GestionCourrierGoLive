# 🔧 Correction : Projet Firebase Incompatible

## ❌ Problème identifié

Votre fichier `.env` utilise le projet **`gestioncourrier-824cd`**, mais les règles Firestore sont déployées sur **`gestioncourrier-1f213`**.

C'est pour ça que vous obtenez l'erreur "Missing or insufficient permissions" !

## ✅ Solution : Choisir un projet et tout aligner

Vous avez **deux options** :

### Option 1 : Utiliser `gestioncourrier-1f213` (Recommandé)

Les index et règles sont déjà déployés sur ce projet.

**Étape 1** : Mettre à jour le fichier `.env` :

```env
VITE_FIREBASE_API_KEY=AIzaSyCV5yNjZP21mTwzXNDf5nGr7TDNWgU9YdY
VITE_FIREBASE_AUTH_DOMAIN=gestioncourrier-1f213.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gestioncourrier-1f213
VITE_FIREBASE_STORAGE_BUCKET=gestioncourrier-1f213.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=540367910462
VITE_FIREBASE_APP_ID=1:540367910462:web:VOTRE_APP_ID
```

**Note** : Vous devrez récupérer les vraies clés pour `gestioncourrier-1f213` depuis Firebase Console.

**Étape 2** : Vérifier que `.firebaserc` utilise le bon projet :
```json
{
  "projects": {
    "default": "gestioncourrier-1f213"
  }
}
```

**Étape 3** : Redémarrer l'application :
```bash
npm run dev
```

### Option 2 : Utiliser `gestioncourrier-824cd`

Si vous préférez utiliser ce projet, il faut déployer les règles dessus.

**Étape 1** : Changer le projet actif :
```bash
firebase use gestioncourrier-824cd
```

**Étape 2** : Déployer les règles :
```bash
firebase deploy --only firestore:rules
```

**Étape 3** : Déployer les index :
```bash
firebase deploy --only firestore:indexes
```

**Étape 4** : Mettre à jour `.firebaserc` :
```json
{
  "projects": {
    "default": "gestioncourrier-824cd"
  }
}
```

## 🎯 Recommandation

Je recommande **Option 1** car les index sont déjà déployés sur `gestioncourrier-1f213`.

## 📋 Checklist

- [ ] Choisir un projet (1f213 ou 824cd)
- [ ] Mettre à jour `.env` avec les bonnes clés
- [ ] Mettre à jour `.firebaserc` avec le bon projet
- [ ] Déployer les règles sur le bon projet
- [ ] Redémarrer l'application
- [ ] Tester la migration

## 🔑 Où trouver les clés Firebase

1. **Firebase Console** → [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. **Sélectionner le projet** (1f213 ou 824cd)
3. **Paramètres du projet** (icône ⚙️) → **Vos applications**
4. **Créer une application Web** si pas déjà fait
5. **Copier les clés de configuration**

