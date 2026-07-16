# 📚 Guide Complet : GitHub pour Débutants

Ce guide vous accompagne étape par étape pour configurer GitHub avec votre projet.

---

## 🔧 Étape 1 : Installer Git (si pas déjà fait)

### Windows

1. **Télécharger Git** :
   - Allez sur [https://git-scm.com/download/win](https://git-scm.com/download/win)
   - Téléchargez l'installateur
   - Exécutez l'installateur avec les options par défaut

2. **Vérifier l'installation** :
   Ouvrez PowerShell ou CMD et tapez :
   ```bash
   git --version
   ```
   Vous devriez voir quelque chose comme : `git version 2.xx.x`

### Alternative : GitHub Desktop

Si vous préférez une interface graphique :
- Téléchargez [GitHub Desktop](https://desktop.github.com/)
- Plus simple pour les débutants

---

## 🔐 Étape 2 : Configurer Git (Première fois)

Ouvrez PowerShell ou CMD dans votre projet et exécutez :

```bash
# Configurer votre nom
git config --global user.name "Votre Nom"

# Configurer votre email (celui de votre compte GitHub)
git config --global user.email "votre.email@example.com"

# Vérifier la configuration
git config --list
```

**Exemple** :
```bash
git config --global user.name "Jean Dupont"
git config --global user.email "jean.dupont@example.com"
```

---

## 📦 Étape 3 : Initialiser Git dans votre Projet

### 3.1 Vérifier si Git est déjà initialisé

```bash
cd "C:\Users\user\Documents\PROJETS FUELMANAGER\GestionCourrier"
git status
```

**Si vous voyez** : `fatal: not a git repository` → Git n'est pas initialisé, continuez.

**Si vous voyez** : La liste des fichiers → Git est déjà initialisé, passez à l'étape 4.

### 3.2 Initialiser Git

```bash
# Initialiser Git
git init

# Vérifier
git status
```

Vous devriez voir la liste de tous vos fichiers.

---

## 📝 Étape 4 : Premier Commit

### 4.1 Ajouter tous les fichiers

```bash
# Ajouter tous les fichiers (sauf ceux dans .gitignore)
git add .

# Vérifier ce qui sera commité
git status
```

### 4.2 Faire le premier commit

```bash
git commit -m "Initial commit: Application Gestion Courrier"
```

**Note** : Le message de commit décrit ce que vous avez fait.

---

## 🌐 Étape 5 : Créer un Repository sur GitHub

### 5.1 Créer un compte GitHub (si pas déjà fait)

1. Allez sur [https://github.com](https://github.com)
2. Cliquez sur **"Sign up"**
3. Remplissez le formulaire
4. Vérifiez votre email

### 5.2 Créer un nouveau repository

1. **Connectez-vous** à GitHub
2. Cliquez sur le bouton **"+"** en haut à droite
3. Cliquez sur **"New repository"**

4. **Remplissez le formulaire** :
   - **Repository name** : `gestion-courrier` (ou le nom de votre choix)
   - **Description** : "Application de gestion de courriers avec Firebase et Redux"
   - **Visibility** :
     - ✅ **Public** : Tout le monde peut voir (gratuit)
     - 🔒 **Private** : Seulement vous (gratuit aussi pour les projets personnels)
   - **NE COCHEZ PAS** :
     - ❌ "Add a README file" (vous avez déjà des fichiers)
     - ❌ "Add .gitignore" (vous avez déjà un .gitignore)
     - ❌ "Choose a license" (optionnel)

5. Cliquez sur **"Create repository"**

### 5.3 GitHub vous donne des instructions

GitHub affichera une page avec des commandes. **Ne les exécutez pas encore**, suivez plutôt les étapes ci-dessous.

---

## 🔗 Étape 6 : Connecter votre Projet à GitHub

### 6.1 Ajouter le remote GitHub

Remplacez `VOTRE_USERNAME` par votre nom d'utilisateur GitHub :

```bash
git remote add origin https://github.com/VOTRE_USERNAME/gestion-courrier.git
```

**Exemple** :
```bash
git remote add origin https://github.com/jeandupont/gestion-courrier.git
```

### 6.2 Vérifier le remote

```bash
git remote -v
```

Vous devriez voir :
```
origin  https://github.com/VOTRE_USERNAME/gestion-courrier.git (fetch)
origin  https://github.com/VOTRE_USERNAME/gestion-courrier.git (push)
```

### 6.3 Renommer la branche en 'main' (si nécessaire)

```bash
git branch -M main
```

### 6.4 Pousser le code vers GitHub

```bash
git push -u origin main
```

**Si c'est la première fois**, GitHub vous demandera de vous authentifier :
- **Option 1** : Utilisez votre nom d'utilisateur et un **Personal Access Token** (recommandé)
- **Option 2** : Utilisez GitHub Desktop (plus simple)

---

## 🔑 Étape 7 : Créer un Personal Access Token (si nécessaire)

Si Git vous demande un mot de passe :

1. **GitHub** → Cliquez sur votre **profil** (en haut à droite) → **Settings**
2. **Developer settings** (en bas à gauche)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token** → **Generate new token (classic)**
5. **Remplissez** :
   - **Note** : "Gestion Courrier"
   - **Expiration** : 90 days (ou No expiration)
   - **Scopes** : Cochez **`repo`** (toutes les cases sous "repo")
6. **Generate token**
7. **Copiez le token** (vous ne pourrez plus le voir après !)
8. **Utilisez-le comme mot de passe** quand Git vous le demande

---

## ✅ Étape 8 : Vérifier que ça fonctionne

1. **Allez sur GitHub** : [https://github.com/VOTRE_USERNAME/gestion-courrier](https://github.com/VOTRE_USERNAME/gestion-courrier)
2. **Vous devriez voir** tous vos fichiers !
3. **Félicitations** ! 🎉

---

## 🔄 Étape 9 : Workflow Quotidien

### Faire des modifications

```bash
# 1. Modifier vos fichiers dans l'éditeur
# ... faire des changements ...

# 2. Voir ce qui a changé
git status

# 3. Ajouter les fichiers modifiés
git add .

# 4. Commiter avec un message descriptif
git commit -m "Ajout de la fonctionnalité X"

# 5. Pousser vers GitHub
git push origin main
```

### Messages de commit recommandés

- ✅ `"Ajout de la synchronisation temps réel"`
- ✅ `"Correction du bug de migration"`
- ✅ `"Mise à jour de l'interface utilisateur"`
- ❌ `"modif"` (trop vague)
- ❌ `"update"` (pas descriptif)

---

## 🐛 Résolution de Problèmes

### Problème 1 : "git is not recognized"

**Solution** : Git n'est pas installé ou pas dans le PATH.
- Réinstallez Git
- Ou utilisez GitHub Desktop

### Problème 2 : "Permission denied"

**Solution** : Problème d'authentification.
- Utilisez un Personal Access Token
- Ou utilisez GitHub Desktop

### Problème 3 : "fatal: remote origin already exists"

**Solution** : Le remote existe déjà.
```bash
# Voir les remotes
git remote -v

# Supprimer l'ancien
git remote remove origin

# Ajouter le nouveau
git remote add origin https://github.com/VOTRE_USERNAME/gestion-courrier.git
```

### Problème 4 : "failed to push some refs"

**Solution** : GitHub a des fichiers que vous n'avez pas localement.
```bash
# Récupérer les changements de GitHub
git pull origin main --allow-unrelated-histories

# Puis pousser
git push origin main
```

---

## 📚 Commandes Git Essentielles

### Voir l'état
```bash
git status              # Voir les fichiers modifiés
git log                 # Voir l'historique des commits
git log --oneline       # Historique compact
```

### Ajouter des fichiers
```bash
git add .               # Ajouter tous les fichiers
git add fichier.ts      # Ajouter un fichier spécifique
```

### Commiter
```bash
git commit -m "Message" # Commiter avec un message
```

### Pousser/Pull
```bash
git push origin main    # Envoyer vers GitHub
git pull origin main    # Récupérer depuis GitHub
```

### Branches
```bash
git branch              # Voir les branches
git branch nouvelle-branche  # Créer une branche
git checkout nouvelle-branche # Changer de branche
```

---

## 🎯 Checklist Complète

- [ ] Git installé et configuré
- [ ] Compte GitHub créé
- [ ] Repository GitHub créé
- [ ] Git initialisé dans le projet
- [ ] Premier commit fait
- [ ] Remote GitHub ajouté
- [ ] Code poussé vers GitHub
- [ ] Fichiers visibles sur GitHub

---

## 🆘 Besoin d'Aide ?

Si vous êtes bloqué :
1. **Vérifiez les messages d'erreur** dans le terminal
2. **Consultez la documentation** : [https://docs.github.com](https://docs.github.com)
3. **Utilisez GitHub Desktop** pour une interface graphique plus simple

---

## 🚀 Prochaines Étapes

Une fois GitHub configuré :
1. **Déployer sur Vercel** : Voir `DEPLOIEMENT_GITHUB_VERCEL.md`
2. **Configurer CI/CD** : Déploiement automatique
3. **Collaborer** : Inviter d'autres développeurs

**Bon courage ! 💪**

