# 🔑 Étapes pour Connecter avec Token GitHub

## 📋 Informations Nécessaires

- ✅ URL de votre repository GitHub (ex: `https://github.com/VOTRE_USERNAME/gestion-courrier.git`)
- ✅ Personal Access Token GitHub

---

## 🚀 Étape 1 : Configurer Git avec le Token

### Méthode A : HTTPS avec Token dans l'URL

```bash
# Remplacer :
# - VOTRE_TOKEN par votre Personal Access Token
# - VOTRE_USERNAME par votre nom d'utilisateur GitHub
# - NOM_REPO par le nom de votre repository

git remote add origin https://VOTRE_TOKEN@github.com/VOTRE_USERNAME/NOM_REPO.git
```

**Exemple** :
```bash
git remote add origin https://ghp_xxxxxxxxxxxxxxxxxxxx@github.com/landrykibakweto/gestion-courrier.git
```

### Méthode B : HTTPS avec Token via Git Credential Helper (Plus Sécurisé)

```bash
# 1. Ajouter le remote sans token
git remote add origin https://github.com/VOTRE_USERNAME/NOM_REPO.git

# 2. Configurer Git pour utiliser le token
git config --global credential.helper store

# 3. Au premier push, Git demandera les identifiants :
#    Username: VOTRE_USERNAME
#    Password: VOTRE_TOKEN (utilisez le token comme mot de passe)
```

### Méthode C : SSH (Si vous avez une clé SSH)

```bash
# Utiliser SSH au lieu de HTTPS
git remote add origin git@github.com:VOTRE_USERNAME/NOM_REPO.git
```

---

## 📤 Étape 2 : Pousser le Code vers GitHub

```bash
# Vérifier que tout est prêt
git status

# Pousser vers GitHub
git push -u origin main
```

Si Git demande des identifiants :
- **Username** : Votre nom d'utilisateur GitHub
- **Password** : Votre Personal Access Token (pas votre mot de passe GitHub !)

---

## 🌐 Étape 3 : Connecter Vercel au Repository

### Option A : Via l'Interface Web (Recommandé)

1. Allez sur [https://vercel.com](https://vercel.com)
2. Connectez-vous ou créez un compte
3. Cliquez sur **"Add New..."** → **"Project"**
4. Cliquez sur **"Import Git Repository"**
5. Si c'est la première fois :
   - Cliquez sur **"Connect GitHub"**
   - Autorisez Vercel à accéder à votre compte GitHub
   - Sélectionnez votre repository privé
6. Cliquez sur **"Import"** à côté de votre repository
7. Configurez :
   - **Framework Preset** : Vite
   - **Build Command** : `npm run build`
   - **Output Directory** : `dist`
8. Ajoutez vos variables d'environnement
9. Cliquez sur **"Deploy"**

### Option B : Via Vercel CLI

```bash
# 1. Se connecter à Vercel
vercel login

# 2. Lier le projet
vercel link

# 3. Déployer
vercel --prod
```

---

## 🔐 Utiliser le Token avec Vercel CLI

Si vous voulez utiliser un token Vercel directement :

```bash
# Définir le token Vercel
$env:VERCEL_TOKEN="votre_token_vercel"

# Ou utiliser directement
vercel --token="votre_token_vercel" --prod
```

---

## ✅ Vérification

```bash
# Vérifier que le remote est configuré
git remote -v

# Tester la connexion
git ls-remote origin
```

---

## 🐛 Problèmes Courants

### Erreur : "Authentication failed"

**Solution** : Vérifiez que :
- Le token est correct
- Le token n'a pas expiré
- Le token a les permissions `repo` (pour les repositories privés)

### Erreur : "Repository not found"

**Solution** : Vérifiez que :
- L'URL du repository est correcte
- Vous avez les droits d'accès au repository
- Le repository existe bien

### Erreur : "Permission denied"

**Solution** : 
- Régénérez le token avec les bonnes permissions
- Vérifiez que le token a accès au repository privé

