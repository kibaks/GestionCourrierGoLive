# Installation et Configuration TWAIN

## ⚠️ Important : TWAIN n'est pas un logiciel séparé

**TWAIN est un standard intégré dans les pilotes de votre scanner.** Vous n'avez pas besoin de télécharger TWAIN séparément. Installez simplement les pilotes de votre scanner depuis le site du fabricant.

**Voir `TELECHARGEMENT_TWAIN.md` pour plus de détails sur les liens de téléchargement.**

## Prérequis

### Windows

1. **Installer les pilotes du scanner**
   - Téléchargez les pilotes depuis le site du fabricant
   - Installez-les selon les instructions
   - Vérifiez que le scanner apparaît dans "Périphériques et imprimantes"

2. **Vérifier que WIA est disponible**
   - WIA (Windows Image Acquisition) est inclus dans Windows
   - Aucune installation supplémentaire n'est nécessaire

3. **Tester le scanner**
   - Ouvrez "Scanner et Appareil photo Windows"
   - Testez un scan pour vérifier que le scanner fonctionne

### macOS

1. **Installer SANE (optionnel mais recommandé)**
   ```bash
   brew install sane-backends
   ```

2. **Vérifier la détection**
   ```bash
   scanimage -L
   ```

### Linux

1. **Installer SANE**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install sane sane-utils libsane-dev
   
   # Fedora/RHEL
   sudo dnf install sane-backends sane-backends-devel
   ```

2. **Vérifier la détection**
   ```bash
   scanimage -L
   ```

## Installation des dépendances Node.js

```bash
cd server
npm install
```

## Démarrage du serveur

```bash
npm run dev
```

Le serveur sera accessible sur `http://localhost:3001`

## Détection des scanners

Le serveur détecte automatiquement :

- **Windows** :
  - Scanners TWAIN/WIA
  - Scanners via les pilotes du fabricant (Device Manager)
  - Scanners réseau

- **macOS** :
  - Scanners USB (via system_profiler et ioreg)
  - Scanners réseau
  - Scanners SANE (si installé)

- **Linux** :
  - Scanners USB
  - Scanners réseau
  - Scanners SANE

## Test de scan

### Via l'API

```bash
curl -X POST http://localhost:3001/api/scanners/{scannerId}/scan \
  -H "Content-Type: application/json" \
  -d '{
    "scanner": {
      "id": "scanner-id",
      "type": "twain",
      "twainDeviceId": "device-id"
    },
    "resolution": 300,
    "color": true,
    "format": "PDF"
  }' \
  --output scan_result.pdf
```

### Via l'interface web

1. Allez dans "Paramètres" > "Scanners"
2. Cliquez sur "Rafraîchir" pour détecter les scanners
3. Sélectionnez un scanner
4. Utilisez le bouton "Scanner" dans le formulaire d'enregistrement de courrier

## Dépannage

### Le scanner n'est pas détecté

1. **Windows** :
   - Vérifiez que le scanner apparaît dans "Gestionnaire de périphériques"
   - Vérifiez que les pilotes sont à jour
   - Redémarrez le serveur backend

2. **macOS/Linux** :
   - Vérifiez que SANE est installé : `scanimage -L`
   - Vérifiez les permissions USB
   - Redémarrez le serveur backend

### Erreur lors du scan

1. **Vérifiez que le scanner est allumé et connecté**
2. **Vérifiez que le scanner n'est pas utilisé par une autre application**
3. **Vérifiez les logs du serveur** pour plus de détails
4. **Sur Windows, vérifiez que WIA fonctionne** :
   - Ouvrez "Scanner et Appareil photo Windows"
   - Testez un scan manuel

### Erreur "TWAIN n'est disponible que sur Windows"

- Cette erreur apparaît si vous essayez d'utiliser TWAIN sur macOS/Linux
- Utilisez SANE à la place (installer avec `brew install sane-backends`)

## Support des formats

- **PDF** : Supporté sur toutes les plateformes
- **JPEG** : Supporté sur toutes les plateformes
- **PNG** : Supporté sur toutes les plateformes
- **TIFF** : Supporté selon le scanner

## Résolutions supportées

Les résolutions communes sont : 150, 200, 300, 600, 1200 DPI

Vérifiez les capacités de votre scanner dans les détails du scanner.

