# 🔗 Connecter votre Projet à GitHub

## 📋 Informations Nécessaires

Pour vous aider, j'ai besoin de :
- **L'URL de votre repository GitHub** (ex: `https://github.com/VOTRE_USERNAME/gestion-courrier`)

---

## 🚀 Étapes de Connexion

### Étape 1 : Ajouter tous les fichiers

```bash
git add .
```

### Étape 2 : Faire un commit

```bash
git commit -m "Initial commit: Application Gestion Courrier avec Firebase et Redux"
```

### Étape 3 : Ajouter le remote GitHub

**Remplacez l'URL par celle de VOTRE repository** :

```bash
git remote add origin https://github.com/VOTRE_USERNAME/gestion-courrier.git
```

**Exemple** :
```bash
git remote add origin https://github.com/jeandupont/gestion-courrier.git
```

### Étape 4 : Renommer la branche en 'main'

```bash
git branch -M main
```

### Étape 5 : Pousser vers GitHub

```bash
git push -u origin main
```

---

## 🔑 Authentification

Si Git vous demande un mot de passe :

1. **Utilisez votre nom d'utilisateur GitHub**
2. **Pour le mot de passe** : Utilisez un **Personal Access Token**

### Créer un Personal Access Token

1. GitHub → Votre profil (en haut à droite) → **Settings**
2. **Developer settings** (en bas à gauche)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token** → **Generate new token (classic)**
5. Remplissez :
   - **Note** : "Gestion Courrier"
   - **Expiration** : 90 days (ou No expiration)
   - **Scopes** : Cochez **`repo`** (toutes les cases)
6. **Generate token**
7. **Copiez le token** (vous ne pourrez plus le voir !)
8. **Utilisez-le comme mot de passe** quand Git vous le demande

---

## ✅ Vérification

Après avoir poussé, allez sur votre repository GitHub. Vous devriez voir tous vos fichiers !

---

## 🆘 Si vous avez une erreur "remote origin already exists"

```bash
# Supprimer l'ancien remote
git remote remove origin

# Ajouter le nouveau
git remote add origin https://github.com/VOTRE_USERNAME/gestion-courrier.git
```

