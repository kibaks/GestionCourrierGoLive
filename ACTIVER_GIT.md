# 🔧 Activer Git après Installation

## ⚠️ Problème

Git est installé mais PowerShell ne le reconnaît pas encore.

---

## ✅ Solution : Redémarrer PowerShell

### Étape 1 : Fermer PowerShell

1. Fermez complètement la fenêtre PowerShell actuelle
2. **Important** : Fermez aussi Cursor/VSCode si vous l'utilisez

### Étape 2 : Rouvrir PowerShell

1. Ouvrez une **nouvelle** fenêtre PowerShell
2. Ou redémarrez Cursor/VSCode

### Étape 3 : Vérifier que Git fonctionne

Dans la nouvelle fenêtre PowerShell, tapez :

```bash
git --version
```

**Si ça fonctionne** : Vous verrez `git version 2.xx.x` ✅

**Si ça ne fonctionne pas** : Voir "Solution Alternative" ci-dessous

---

## 🔄 Solution Alternative : Ajouter Git au PATH

Si redémarrer ne fonctionne pas :

### Option 1 : Utiliser Git Bash (Recommandé)

1. Cherchez **"Git Bash"** dans le menu Démarrer
2. Ouvrez **Git Bash**
3. Naviguez vers votre projet :
   ```bash
   cd "/c/Users/user/Documents/PROJETS FUELMANAGER/GestionCourrier"
   ```
4. Utilisez Git Bash au lieu de PowerShell

### Option 2 : Vérifier l'installation de Git

1. Ouvrez **"Paramètres"** Windows
2. Allez dans **"Applications"** → **"Applications et fonctionnalités"**
3. Cherchez **"Git"**
4. Si Git n'est pas là, réinstallez-le :
   - [https://git-scm.com/download/win](https://git-scm.com/download/win)
   - **Important** : Pendant l'installation, choisissez :
     - ✅ "Git from the command line and also from 3rd-party software"

### Option 3 : Redémarrer l'ordinateur

Parfois, un redémarrage complet est nécessaire pour que les changements de PATH prennent effet.

---

## 🚀 Une fois Git Fonctionnel

Après avoir vérifié que `git --version` fonctionne, suivez ces étapes :

### 1. Configurer Git (première fois)

```bash
git config --global user.name "Votre Nom"
git config --global user.email "votre.email@example.com"
```

**Remplacez** par vos vraies informations.

### 2. Vérifier l'état

```bash
cd "C:\Users\user\Documents\PROJETS FUELMANAGER\GestionCourrier"
git status
```

### 3. Ajouter les fichiers

```bash
git add .
```

### 4. Faire le premier commit

```bash
git commit -m "Initial commit: Application Gestion Courrier avec Firebase et Redux"
```

### 5. Connecter à GitHub

**Remplacez `VOTRE_USERNAME` et `NOM_REPOSITORY`** par vos vraies valeurs :

```bash
git remote add origin https://github.com/VOTRE_USERNAME/NOM_REPOSITORY.git
```

**Exemple** :
```bash
git remote add origin https://github.com/jeandupont/gestion-courrier.git
```

### 6. Renommer la branche

```bash
git branch -M main
```

### 7. Pousser vers GitHub

```bash
git push -u origin main
```

**Si on vous demande un mot de passe** :
- **Nom d'utilisateur** : Votre nom d'utilisateur GitHub
- **Mot de passe** : Utilisez un **Personal Access Token** (voir guide ci-dessous)

---

## 🔑 Créer un Personal Access Token

Si Git vous demande un mot de passe :

1. Allez sur [GitHub.com](https://github.com)
2. Cliquez sur votre **profil** (en haut à droite) → **Settings**
3. **Developer settings** (en bas à gauche)
4. **Personal access tokens** → **Tokens (classic)**
5. **Generate new token** → **Generate new token (classic)**
6. Remplissez :
   - **Note** : "Gestion Courrier"
   - **Expiration** : 90 days (ou No expiration)
   - **Scopes** : Cochez **`repo`** (toutes les cases)
7. **Generate token**
8. **Copiez le token** (vous ne pourrez plus le voir !)
9. **Utilisez-le comme mot de passe** quand Git vous le demande

---

## ✅ Vérification Finale

1. Allez sur votre repository GitHub
2. Vous devriez voir tous vos fichiers !
3. **Félicitations !** 🎉

---

## 🆘 Besoin d'Aide ?

Dites-moi :
- Est-ce que `git --version` fonctionne maintenant ?
- Quelle est l'URL de votre repository GitHub ?
- À quelle étape êtes-vous bloqué ?

Je vous guiderai étape par étape ! 😊

