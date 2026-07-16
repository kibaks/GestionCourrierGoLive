# Scanner Canon imageRUNNER 2206N - Guide d'Installation macOS

Ce guide explique comment configurer le Canon imageRUNNER 2206N (et autres scanners Canon réseau) sur macOS en utilisant l'architecture de scan avancée ICA/SANE.

## Architecture

Le système utilise trois approches complémentaires :

1. **ICA (Image Capture Architecture)** - API native macOS (recommandé)
2. **SANE (Scanner Access Now Easy)** - Backend `pixma` via `scanimage`
3. **IPP/AirScan** - Protocole réseau pour scanners modernes

## Prérequis

### macOS Requirements
- macOS 10.15 (Catalina) ou supérieur
- Xcode Command Line Tools
- Homebrew (recommandé)

### Scanner Requirements
- Canon imageRUNNER 2206N connecté au réseau
- Adresse IP fixe ou DHCP réservé
- Port IPP (631) ou Web Services (80/443) accessible

## Installation

### 1. Installer Xcode Command Line Tools

```bash
xcode-select --install
```

### 2. Compiler l'outil ICA (Optionnel mais recommandé)

L'utilitaire Swift ICA permet une détection native optimale des scanners Canon.

```bash
cd tools/mac-ica-scan
swiftc -o mac-ica-scan MacICAScan.swift -framework ImageCaptureCore
chmod +x mac-ica-scan
```

### 3. Installer SANE (Optionnel - Fallback)

Si vous souhaitez utiliser SANE comme alternative :

```bash
# Via Homebrew
brew install sane-backends

# Configurer le backend pixma pour Canon
sudo mkdir -p /usr/local/etc/sane.d
sudo tee /usr/local/etc/sane.d/pixma.conf << EOF
# Canon imageRUNNER via réseau
bjnp://192.168.1.100  # Remplacez par l'IP de votre scanner
EOF
```

### 4. Vérifier la connexion réseau

```bash
# Tester la connectivité au scanner
ping 192.168.1.100

# Vérifier les ports ouverts
nc -z 192.168.1.100 631  # IPP
nc -z 192.168.1.100 80   # Web
```

## Configuration du Canon imageRUNNER 2206N

### 1. Accéder au panneau de configuration

Sur l'écran tactile du scanner :
- Menu → Réglages → Réseau → Paramètres TCP/IP
- Notez l'adresse IP (ex: 192.168.1.100)

### 2. Activer les services de scan

- Menu → Fonctions → Scan → Paramètres distants
- Activer :
  - **Scan à partir d'un PC** : Activé
  - **IPP/AirScan** : Activé (si disponible)
  - **Web Services** : Activé

### 3. Configurer le protocole WS-Scan (Windows/Mac)

Le Canon 2206N utilise WS-Scan (Web Services Scan) natif :

1. Menu → Réglages → Réseau → Web Services
2. Activer "WS-Discovery"
3. Activer "WS-Scan"

## Utilisation dans l'Application

### Détection automatique

1. Allez dans **Paramètres → Gestion des scanners**
2. Cliquez sur **"Détecter les scanners"**
3. Les scanners Canon apparaîtront avec le type :
   - `system` : Détecté via ICA (natif Mac)
   - `vendor-driver` : Détecté via SANE
   - `network` : Détecté via IPP/AirScan

### Scan d'un document

1. Sélectionnez le scanner Canon dans la liste
2. Choisissez les options :
   - **Source** : Vitre (flatbed) ou Bac (ADF)
   - **Résolution** : 150, 300, ou 600 DPI
   - **Format** : PDF, JPEG, ou PNG
   - **Mode couleur** : Couleur, Niveaux de gris, ou Noir et blanc
3. Cliquez sur **Scanner**

### Dépannage

#### Problème : Scanner non détecté

**Solutions :**

1. **Vérifier la connexion réseau**
   ```bash
   ping <IP_du_scanner>
   ```

2. **Vérifier SANE**
   ```bash
   scanimage -L
   ```
   Si vide, le backend pixma n'est pas configuré.

3. **Vérifier ICA**
   ```bash
   cd tools/mac-ica-scan
   ./mac-ica-scan list
   ```

4. **Forcer l'ajout manuel**
   - Paramètres → Gestion des scanners
   - "Ajouter manuellement"
   - Entrez l'IP du scanner

#### Problème : Scan échoue avec timeout

**Solutions :**

1. Réduire la résolution (300 DPI max)
2. Vérifier que le scanner n'est pas en veille
3. Augmenter le timeout dans les paramètres avancés

#### Problème : Qualité d'image médiocre

**Solutions :**

1. Nettoyer la vitre du scanner
2. Vérifier les lampes (remplacement si nécessaire)
3. Utiliser 300 DPI minimum pour les documents officiels

### Configuration avancée

#### Backend SANE personnalisé

Créez un fichier `~/.sane/pixma.conf` :

```
# Canon imageRUNNER 2206N
bjnp://192.168.1.100
# ou pour USB
usb 0x04a9 0x176e
```

#### Utiliser un pilote Canon officiel

Si disponible, téléchargez le pilote depuis le site Canon :
- [Canon Drivers & Downloads](https://www.canon.com/support/download/index.html)
- Installez le pilote MF Scan Utility
- L'application utilisera automatiquement le pilote système

## Support technique

### Logs de debug

Activer les logs détaillés :

```bash
# Dans l'application, console navigateur
localStorage.setItem('debug_scanner', 'true')
```

### Diagnostic complet

```bash
# 1. Vérifier SANE
scanimage -L

# 2. Vérifier ICA (macOS)
system_profiler SPUSBDataType | grep -i canon

# 3. Vérifier réseau
arp -a | grep -i canon

# 4. Test scan manuel
curl -v http://192.168.1.100/  # Interface web Canon
```

## Références

- [SANE Pixma Backend](http://www.sane-project.org/man/sane-pixma.5.html)
- [Apple ImageCaptureCore](https://developer.apple.com/documentation/imagecapturecore)
- [Canon WS-Scan Protocol](https://developers.canon.com/)
- [IPP Scan Specification](https://ftp.pwg.org/pub/pwg/fsg/jobticket/IPP-Scan-10-20200819.pdf)

## Notes spécifiques Canon imageRUNNER 2206N

### Fonctionnalités supportées

| Fonction | ICA | SANE | IPP |
|----------|-----|------|-----|
| Scan couleur | ✅ | ✅ | ✅ |
| ADF (chargeur) | ✅ | ✅ | ⚠️* |
| Duplex | ✅ | ✅ | ❌ |
| Résolutions | Jusqu'à 600 DPI | Jusqu'à 600 DPI | Jusqu'à 300 DPI |
| Format PDF | ✅ | ✅ | ✅ |

*Selon configuration réseau

### Limitations connues

1. **AirScan/IPP** : Le 2206N peut nécessiter une mise à jour firmware pour IPP natif
2. **SANE** : Le backend `pixma` supporte le 2206N depuis la version 1.0.28
3. **ADF** : Nécessite le pilote Canon complet pour fonctionnalités avancées

### Mise à jour firmware

1. Accédez à l'interface web du scanner : `http://<IP>/`
2. Menu Système → Mise à jour
3. Téléchargez la dernière version depuis Canon

---

**Dernière mise à jour** : Mars 2026  
**Version du guide** : 1.0
