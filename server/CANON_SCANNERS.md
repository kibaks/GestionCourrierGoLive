# Support des Scanners Canon

## Compatibilité TWAIN avec Canon

**Oui, TWAIN fonctionne parfaitement avec les scanners Canon !** 

Canon fournit des pilotes TWAIN pour la plupart de ses scanners, notamment via leur logiciel **ScanGear** qui est un pilote TWAIN standard.

## Modèles Canon Supportés

### Scanners Canon Compatibles TWAIN

- **Canon imageFORMULA série** (P-215II, DR-2020U, DR-2080C, etc.)
- **Canon CanoScan série** (LIDE, 9000F, etc.)
- **Canon imageRUNNER série** (multifonctions avec fonction scanner)
- **Canon imageCLASS série** (multifonctions)

### Installation des Pilotes Canon

1. **Télécharger les pilotes Canon**
   - Visitez le site Canon : https://www.canon.fr/support
   - Recherchez votre modèle de scanner
   - Téléchargez les pilotes TWAIN/ScanGear

2. **Installer ScanGear (Pilote TWAIN Canon)**
   - Exécutez le fichier d'installation
   - Suivez les instructions d'installation
   - Redémarrez l'ordinateur si demandé

3. **Vérifier l'installation**
   - Ouvrez "Périphériques et imprimantes" (Windows)
   - Vérifiez que votre scanner Canon apparaît
   - Testez avec "Scanner et Appareil photo Windows"

## Détection Automatique

Le serveur backend détecte automatiquement les scanners Canon via :

1. **TWAIN/WIA** : Détection via l'API Windows Image Acquisition
   - Les scanners Canon avec pilotes TWAIN installés sont automatiquement détectés
   - Le système identifie les scanners Canon par leur nom/fabricant

2. **Pilotes Fabricant** : Détection via Device Manager
   - Détecte les scanners Canon même sans pilote TWAIN
   - Utilise les pilotes Canon spécifiques si disponibles

## Utilisation

### Via l'Interface Web

1. Allez dans **"Paramètres" > "Scanners"**
2. Cliquez sur **"Rafraîchir"** pour détecter les scanners
3. Votre scanner Canon devrait apparaître dans la liste
4. Sélectionnez-le et utilisez le bouton **"Scanner"** dans le formulaire

### Caractéristiques Spécifiques Canon

Les scanners Canon détectés bénéficient automatiquement de :

- **Résolutions élevées** : jusqu'à 2400 DPI (selon le modèle)
- **Support PDF/A** : format d'archivage PDF
- **Duplex automatique** : pour les modèles compatibles
- **Corrections d'image** : via ScanGear (si configuré)

## Dépannage

### Le scanner Canon n'est pas détecté

1. **Vérifier l'installation des pilotes**
   ```powershell
   # Vérifier dans PowerShell
   Get-PnpDevice -Class Image | Where-Object { $_.FriendlyName -like "*Canon*" }
   ```

2. **Vérifier WIA**
   - Ouvrez "Scanner et Appareil photo Windows"
   - Votre scanner Canon devrait apparaître

3. **Réinstaller ScanGear**
   - Désinstallez l'ancienne version
   - Téléchargez la dernière version depuis le site Canon
   - Réinstallez et redémarrez

### Erreur lors du scan avec Canon

1. **Vérifier que le scanner est allumé et connecté**
2. **Vérifier que ScanGear n'est pas ouvert** (fermez-le avant de scanner)
3. **Vérifier les permissions** : le scanner doit être accessible
4. **Vérifier les logs du serveur** pour plus de détails

### Problèmes de compatibilité 64 bits

Certains anciens pilotes Canon TWAIN peuvent avoir des problèmes avec les applications 64 bits.

**Solution** :
- Téléchargez la version 64 bits des pilotes Canon
- Utilisez la dernière version de ScanGear disponible

## API Canon Spécifique (Optionnel)

Si vous avez besoin de fonctionnalités spécifiques Canon non disponibles via TWAIN, vous pouvez utiliser :

- **Canon CaptureOnTouch** : API Canon pour certains modèles
- **Canon SDK** : Pour les développements avancés

Cependant, pour la plupart des cas d'usage, **TWAIN est suffisant** et plus universel.

## Exemple de Configuration

```javascript
// Le scanner Canon est automatiquement détecté avec ces propriétés :
{
  id: "twain-canon-xxx",
  name: "Canon imageFORMULA P-215II",
  manufacturer: "Canon",
  model: "imageFORMULA P-215II",
  type: "twain",
  isCanon: true,
  capabilities: {
    color: true,
    duplex: true,
    resolution: [150, 200, 300, 400, 600, 1200, 2400],
    formats: ["PDF", "JPEG", "PNG", "TIFF", "PDF/A"]
  }
}
```

## Ressources

- **Site Canon Support** : https://www.canon.fr/support
- **ScanGear Documentation** : Disponible dans le menu d'aide de ScanGear
- **Canon TWAIN Drivers** : Téléchargeables depuis le site Canon

## Notes Importantes

- ✅ **TWAIN fonctionne avec tous les scanners Canon modernes**
- ✅ **ScanGear est le pilote TWAIN officiel Canon**
- ✅ **Détection automatique** via WIA et Device Manager
- ✅ **Support des fonctionnalités avancées** (duplex, haute résolution, etc.)

