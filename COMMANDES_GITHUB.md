# 🚀 Commandes GitHub - Guide Rapide

## ✅ État Actuel

Git est **déjà initialisé** dans votre projet ! Vous pouvez maintenant :

---

## 📋 Commandes à Exécuter (dans l'ordre)

### 1. Vérifier l'état actuel

```bash
git status
```

### 2. Ajouter tous les fichiers

```bash
git add .
```

### 3. Faire le premier commit (si pas déjà fait)

```bash
git commit -m "Initial commit: Application Gestion Courrier avec Firebase et Redux"
```

### 4. Créer un repository sur GitHub

1. Allez sur [https://github.com](https://github.com)
2. Cliquez sur **"+"** → **"New repository**
3. Nommez-le : `gestion-courrier`
4. **NE COCHEZ RIEN** (pas de README, pas de .gitignore)
5. Cliquez sur **"Create repository"**

### 5. Connecter votre projet à GitHub

**Remplacez `VOTRE_USERNAME` par votre nom d'utilisateur GitHub** :

```bash
git remote add origin https://github.com/VOTRE_USERNAME/gestion-courrier.git
```

### 6. Renommer la branche en 'main'

```bash
git branch -M main
```

### 7. Pousser vers GitHub

```bash
git push -u origin main
```

**Si on vous demande un mot de passe** :
- Utilisez un **Personal Access Token** (voir guide complet)

---

## 🔑 Créer un Personal Access Token

1. GitHub → Votre profil → **Settings**
2. **Developer settings** (en bas à gauche)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)**
5. **Note** : "Gestion Courrier"
6. **Scopes** : Cochez **`repo`**
7. **Generate token**
8. **Copiez le token** et utilisez-le comme mot de passe

---

## 📚 Guide Complet

Pour plus de détails, consultez **`GUIDE_GITHUB.md`**

---

## 🆘 Besoin d'Aide ?

Si vous êtes bloqué, dites-moi à quelle étape vous êtes et je vous aiderai ! 😊

