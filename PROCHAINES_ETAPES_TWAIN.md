# Prochaines Étapes - Configuration TWAIN

Maintenant que vous avez installé le driver TWAIN de votre scanner, suivez ces étapes pour l'utiliser dans l'application.

## ✅ Étape 1 : Démarrer le serveur backend

Le serveur backend est nécessaire pour détecter et utiliser votre scanner TWAIN.

### Dans un terminal, exécutez :

```bash
cd server
npm install  # Si ce n'est pas déjà fait
npm run dev
```

Le serveur devrait démarrer sur `http://localhost:3001` et afficher :
```
🚀 Serveur backend démarré sur http://localhost:3001
📡 API disponible sur http://localhost:3001/api
```

**⚠️ Important :** Gardez ce terminal ouvert pendant que vous utilisez l'application.

---

## ✅ Étape 2 : Démarrer l'application frontend

Dans un **nouveau terminal**, démarrez l'application React :

```bash
npm run dev
```

L'application sera accessible sur `http://localhost:5173`

---

## ✅ Étape 3 : Vérifier la détection du scanner

1. **Ouvrez l'application** dans votre navigateur
2. Allez dans **"Paramètres"** (menu latéral)
3. Cliquez sur **"Gestion des Scanners"**
4. Cliquez sur le bouton **"Rafraîchir"** 🔄

### Ce qui devrait se passer :

- ✅ Votre scanner TWAIN devrait apparaître dans la liste
- ✅ Le statut devrait être **"En ligne"** (icône verte ✓)
- ✅ Les informations du scanner (fabricant, modèle) devraient être affichées

### Si le scanner n'apparaît pas :

1. **Vérifiez que le scanner est allumé et connecté** (USB ou réseau)
2. **Vérifiez dans Windows** :
   - Ouvrez "Périphériques et imprimantes"
   - Vérifiez que votre scanner apparaît
   - Testez avec "Scanner et Appareil photo Windows" pour confirmer qu'il fonctionne
3. **Vérifiez les logs du serveur backend** dans le terminal où vous avez lancé `npm run dev`
   - Recherchez les messages de détection
   - Vérifiez s'il y a des erreurs

---

## ✅ Étape 4 : Tester le scan

Une fois le scanner détecté :

1. **Dans la page "Gestion des Scanners"**, cliquez sur votre scanner pour voir les détails
2. Cliquez sur le bouton **"Tester la connexion"** pour vérifier que tout fonctionne
3. **Pour scanner un document** :
   - Allez dans **"Enregistrer un courrier"** ou le formulaire où vous souhaitez ajouter un scan
   - Utilisez le bouton de scan (si disponible dans le formulaire)
   - Sélectionnez votre scanner TWAIN
   - Configurez les options (résolution, couleur, format)
   - Cliquez sur **"Scanner"**

---

## 🔧 Dépannage

### Le scanner n'est pas détecté

**Vérifications :**

1. ✅ Le serveur backend est démarré (`npm run dev` dans le dossier `server`)
2. ✅ Le scanner est allumé et connecté
3. ✅ Les pilotes TWAIN sont bien installés
4. ✅ Windows reconnaît le scanner (vérifiez dans "Périphériques et imprimantes")

**Solution :**
- Redémarrez le serveur backend
- Cliquez à nouveau sur "Rafraîchir" dans l'interface
- Vérifiez les logs du serveur pour voir les erreurs éventuelles

### Erreur lors du scan : "TWAIN n'est disponible que sur Windows"

**Cause :** Vous êtes sur macOS ou Linux, mais TWAIN fonctionne uniquement sur Windows.

**Solutions :**
- Sur macOS : Utilisez SANE (voir `server/README.md`)
- Sur Linux : Utilisez SANE (voir `server/README.md`)
- Sur Windows : Vérifiez que vous êtes bien sur Windows et que les pilotes sont installés

### Erreur : "ID de périphérique TWAIN non trouvé"

**Cause :** Le scanner n'a pas été correctement détecté avec son ID TWAIN.

**Solution :**
1. Vérifiez que le scanner apparaît dans la liste des scanners détectés
2. Si le scanner apparaît mais sans ID TWAIN, il se peut qu'il soit détecté comme "vendor-driver" au lieu de "twain"
3. Le scan devrait quand même fonctionner via les pilotes du fabricant

### Le scan prend trop de temps ou échoue

**Vérifications :**
1. ✅ Le scanner n'est pas occupé par une autre application
2. ✅ Le document est correctement placé dans le scanner
3. ✅ La résolution choisie n'est pas trop élevée (essayez 300 DPI au lieu de 600+)

**Solution :**
- Fermez les autres applications qui pourraient utiliser le scanner
- Réessayez avec une résolution plus faible
- Vérifiez les logs du serveur backend pour plus de détails

---

## 📝 Notes importantes

- **Le serveur backend doit rester démarré** pendant que vous utilisez l'application
- **TWAIN fonctionne uniquement sur Windows** (pour macOS/Linux, utilisez SANE)
- **Les scanners réseau** peuvent aussi être détectés automatiquement
- **Les scanners USB** sont détectés en temps réel

---

## 🎯 Prochaines fonctionnalités

Une fois que le scan fonctionne, vous pouvez :
- ✅ Scanner des documents directement dans les formulaires
- ✅ Joindre les scans aux courriers
- ✅ Configurer les paramètres de scan par défaut (résolution, format, couleur)

---

## 📞 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs du serveur backend dans le terminal
2. Vérifiez la console du navigateur (F12) pour les erreurs frontend
3. Consultez les fichiers de documentation :
   - `server/INSTALLATION_TWAIN.md`
   - `server/CANON_SCANNERS.md` (si vous avez un scanner Canon)
   - `server/README.md`

