# 🔐 Configuration Git avec Token GitHub

## ⚠️ Méthode Sécurisée (Recommandée)

Pour éviter que le token apparaisse dans l'historique Git, utilisez cette méthode :

### Étape 1 : Ajouter le remote SANS token

```bash
git remote add origin https://github.com/VOTRE_USERNAME/NOM_REPO.git
```

### Étape 2 : Configurer Git Credential Helper

```bash
# Windows (PowerShell)
git config --global credential.helper wincred

# Ou pour stocker dans un fichier
git config --global credential.helper store
```

### Étape 3 : Pousser (Git demandera les identifiants)

```bash
git push -u origin main
```

Quand Git demande :
- **Username** : Votre nom d'utilisateur GitHub
- **Password** : Votre Personal Access Token (pas votre mot de passe !)

---

## 🔄 Méthode Alternative : Token dans l'URL (Moins Sécurisé)

```bash
git remote add origin https://VOTRE_TOKEN@github.com/VOTRE_USERNAME/NOM_REPO.git
git push -u origin main
```

⚠️ **Attention** : Le token apparaîtra dans `.git/config` et pourrait être visible dans l'historique.

---

## ✅ Vérification

```bash
# Vérifier le remote
git remote -v

# Tester la connexion
git ls-remote origin
```

