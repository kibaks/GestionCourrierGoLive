# Configuration Firebase pour le Déploiement Vercel

Ce guide explique comment configurer Firebase pour permettre les insertions depuis votre site déployé sur Vercel.

## 🔍 Problème Identifié

Lors de l'inscription d'un courrier depuis `https://gestion-courrier-cnj7.vercel.app/`, les insertions Firestore sont bloquées. Cela peut être dû à :

1. **Règles Firestore non déployées** ou trop restrictives
2. **Domaine Vercel non autorisé** dans Firebase Authentication
3. **Champ `createdBy` manquant** lors de la création (corrigé dans le code)

## ✅ Solution 1 : Déployer les Règles Firestore

### Option A : Règles Temporaires (Pour tester rapidement)

Les règles actuelles dans `firestore.rules` permettent tout (`allow read, write: if true;`). Si ces règles ne sont pas déployées, déployez-les :

```bash
# Installer Firebase CLI si ce n'est pas déjà fait
npm install -g firebase-tools

# Se connecter à Firebase
firebase login

# Initialiser Firebase (si pas déjà fait)
firebase init firestore

# Déployer les règles
firebase deploy --only firestore:rules
```

### Option B : Règles Complètes (Recommandé pour la production)

1. **Copier les règles complètes** depuis `src/config/firestoreRules.md` :
   - Ouvrez `src/config/firestoreRules.md`
   - Copiez le contenu du bloc de code JavaScript (lignes 5-168)
   - Remplacez le contenu de `firestore.rules` à la racine du projet

2. **Déployer les règles** :
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Vérifier dans la console Firebase** :
   - Allez dans Firebase Console → Firestore Database → Règles
   - Vérifiez que les règles sont bien déployées

## ✅ Solution 2 : Autoriser le Domaine Vercel dans Firebase Auth

Pour que l'authentification fonctionne depuis Vercel :

1. **Ouvrir Firebase Console** :
   - Allez sur [https://console.firebase.google.com](https://console.firebase.google.com)
   - Sélectionnez votre projet `gestioncourrier-824cd`

2. **Configurer les domaines autorisés** :
   - Allez dans **Authentication** → **Settings** (Paramètres)
   - Faites défiler jusqu'à **Authorized domains** (Domaines autorisés)
   - Cliquez sur **Add domain** (Ajouter un domaine)
   - Ajoutez : `gestion-courrier-cnj7.vercel.app`
   - Cliquez sur **Add** (Ajouter)

3. **Domaines par défaut** (déjà autorisés) :
   - `localhost` (pour le développement local)
   - `gestioncourrier-824cd.firebaseapp.com` (domaine Firebase par défaut)

## ✅ Solution 3 : Vérifier la Configuration

### Vérifier que les règles sont déployées

1. **Dans Firebase Console** :
   - Firestore Database → Règles
   - Vérifiez que les règles affichées correspondent à celles dans `firestore.rules`

2. **Tester les règles** :
   - Utilisez l'onglet "Rules Playground" dans Firebase Console
   - Testez une création de courrier avec un utilisateur authentifié

### Vérifier l'authentification

1. **Tester la connexion** :
   - Sur votre site Vercel, essayez de vous connecter
   - Ouvrez la console du navigateur (F12)
   - Vérifiez qu'il n'y a pas d'erreurs d'authentification

2. **Vérifier l'utilisateur authentifié** :
   - Dans la console du navigateur, tapez :
   ```javascript
   // Vérifier que Firebase Auth fonctionne
   import { auth } from './config/firebase';
   console.log('User:', auth.currentUser);
   ```

## 🔧 Corrections Apportées au Code

Le code a été mis à jour pour :

1. **Ajouter le champ `createdBy`** lors de la création d'un courrier :
   - Le champ `createdBy` est maintenant automatiquement ajouté avec l'UID de l'utilisateur authentifié
   - Cela permet aux règles Firestore de vérifier que l'utilisateur est bien le créateur

2. **Vérifier l'authentification** :
   - Le code vérifie maintenant que l'utilisateur est authentifié avant de créer un courrier
   - Une erreur est levée si l'utilisateur n'est pas authentifié

## 📋 Checklist de Déploiement

Avant de tester l'insertion depuis Vercel :

- [ ] Les règles Firestore sont déployées (`firebase deploy --only firestore:rules`)
- [ ] Le domaine Vercel est ajouté dans Firebase Auth → Settings → Authorized domains
- [ ] Les variables d'environnement sont configurées dans Vercel (voir `CONFIGURATION_VERCEL.md`)
- [ ] L'application est redéployée sur Vercel après les changements
- [ ] L'utilisateur peut se connecter sur le site Vercel
- [ ] Les règles Firestore permettent la création si `createdBy == request.auth.uid`

## 🐛 Dépannage

### Erreur : "Missing or insufficient permissions"

**Cause** : Les règles Firestore bloquent l'opération.

**Solution** :
1. Vérifiez que les règles sont déployées
2. Vérifiez que l'utilisateur est authentifié (`auth.currentUser` n'est pas null)
3. Vérifiez que le champ `createdBy` est bien défini lors de la création
4. Utilisez les règles temporaires (`allow read, write: if true;`) pour tester

### Erreur : "Firebase: Error (auth/unauthorized-domain)"

**Cause** : Le domaine Vercel n'est pas autorisé dans Firebase Auth.

**Solution** :
1. Allez dans Firebase Console → Authentication → Settings
2. Ajoutez `gestion-courrier-cnj7.vercel.app` dans Authorized domains

### Erreur : "User is not authenticated"

**Cause** : L'utilisateur n'est pas connecté avec Firebase Auth.

**Solution** :
1. Vérifiez que l'utilisateur se connecte bien avec Firebase Auth
2. Vérifiez que la session n'a pas expiré
3. Vérifiez que les variables d'environnement Firebase sont correctes dans Vercel

## 📚 Ressources

- [Documentation Firebase Firestore Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Documentation Firebase Auth - Authorized Domains](https://firebase.google.com/docs/auth/web/start#set_the_authentication_domain)
- [Documentation Vercel - Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

## 🚀 Commandes Rapides

```bash
# Déployer les règles Firestore
firebase deploy --only firestore:rules

# Vérifier les règles déployées
firebase firestore:rules:get

# Voir les logs de déploiement
firebase deploy --only firestore:rules --debug
```

