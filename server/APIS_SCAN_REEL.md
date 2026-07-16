# APIs pour le Scan Réel de Documents

## État Actuel

Actuellement, le scan est **simulé** (le backend retourne un message sans réellement scanner). Pour implémenter le scan réel, vous devez utiliser une des APIs suivantes selon votre système d'exploitation.

## Options Disponibles

### 1. **SANE (Scanner Access Now Easy)** - Recommandé pour Linux/macOS

**SANE** est une API standardisée pour accéder aux scanners sur Linux et macOS.

#### Installation

**macOS:**
```bash
brew install sane-backends
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install sane sane-utils libsane-dev
```

**Linux (Fedora/RHEL):**
```bash
sudo dnf install sane-backends sane-backends-devel
```

#### Installation de la bibliothèque Node.js

```bash
cd server
npm install sane
```

#### Implémentation dans `server.js`

```javascript
import sane from 'sane';

// Fonction de scan avec SANE
async function scanWithSANE(scannerId, options) {
  return new Promise((resolve, reject) => {
    const device = sane.Scanner(); // Utiliser le scanner par ID ou nom
    
    const params = {
      mode: options.color ? 'color' : 'gray',
      resolution: options.resolution || 300,
      format: options.format || 'pdf'
    };
    
    device.scan(params, (err, image) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Convertir l'image en Buffer puis en File
      const buffer = Buffer.from(image);
      const fileName = `scan_${Date.now()}.${options.format?.toLowerCase() || 'pdf'}`;
      
      resolve({
        file: buffer,
        fileName: fileName,
        mimeType: `application/${options.format?.toLowerCase() || 'pdf'}`
      });
    });
  });
}

// Mettre à jour la route /api/scanners/:id/scan
app.post('/api/scanners/:id/scan', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, color, duplex, format } = req.body;
    
    const result = await scanWithSANE(id, {
      resolution,
      color,
      duplex,
      format
    });
    
    // Retourner le fichier scanné
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### Avantages
- ✅ Standardisé et bien supporté
- ✅ Multi-plateforme (Linux, macOS)
- ✅ Open source
- ✅ Support de nombreux scanners

#### Inconvénients
- ❌ Nécessite l'installation de SANE
- ❌ Configuration parfois complexe
- ❌ Pas de support Windows natif

---

### 2. **TWAIN** - Pour Windows

**TWAIN** (Technology Without An Interesting Name) est le standard pour Windows.

#### Installation

```bash
cd server
npm install twain
```

**Note:** TWAIN nécessite que les pilotes du scanner soient installés sur Windows.

#### Implémentation dans `server.js`

```javascript
import twain from 'twain';

// Fonction de scan avec TWAIN
async function scanWithTWAIN(scannerId, options) {
  return new Promise((resolve, reject) => {
    const scanner = twain.acquire();
    
    scanner.setResolution(options.resolution || 300);
    scanner.setPixelType(options.color ? 'color' : 'gray');
    scanner.setPaperSize('A4');
    
    scanner.scan((err, image) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Convertir en Buffer
      const buffer = Buffer.from(image);
      const fileName = `scan_${Date.now()}.${options.format?.toLowerCase() || 'pdf'}`;
      
      resolve({
        file: buffer,
        fileName: fileName,
        mimeType: `application/${options.format?.toLowerCase() || 'pdf'}`
      });
    });
  });
}

// Mettre à jour la route /api/scanners/:id/scan
app.post('/api/scanners/:id/scan', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, color, duplex, format } = req.body;
    
    const result = await scanWithTWAIN(id, {
      resolution,
      color,
      duplex,
      format
    });
    
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### Avantages
- ✅ Standard Windows
- ✅ Support natif par la plupart des scanners Windows
- ✅ Bonne intégration avec les pilotes Windows

#### Inconvénients
- ❌ Windows uniquement
- ❌ Nécessite les pilotes du scanner installés
- ❌ Bibliothèque Node.js moins maintenue

---

### 3. **WIA (Windows Image Acquisition)** - Alternative Windows

**WIA** est une API Microsoft pour accéder aux scanners et caméras.

#### Installation

```bash
cd server
npm install wia
```

#### Implémentation

```javascript
import wia from 'wia';

async function scanWithWIA(scannerId, options) {
  const device = wia.getDevice(scannerId);
  
  const scanOptions = {
    Resolution: options.resolution || 300,
    ColorMode: options.color ? 'Color' : 'Grayscale',
    Format: options.format || 'PDF'
  };
  
  const result = await device.scan(scanOptions);
  return result;
}
```

---

### 4. **Image Capture (macOS uniquement)**

Pour macOS, vous pouvez utiliser l'API **Image Capture** via des commandes système.

#### Implémentation

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function scanWithImageCapture(scannerId, options) {
  // Utiliser la commande `scanimage` (SANE) ou `sips` (macOS)
  const command = `scanimage --device-name="${scannerId}" --resolution ${options.resolution || 300} --format=${options.format || 'pdf'}`;
  
  const { stdout } = await execAsync(command);
  return Buffer.from(stdout);
}
```

---

### 5. **API REST des Scanners Réseau**

Pour les scanners réseau (IP), vous pouvez utiliser leurs APIs REST natives.

#### Exemple avec un scanner HP

```javascript
async function scanWithNetworkScanner(ipAddress, options) {
  const scanUrl = `http://${ipAddress}/Scan/Jobs`;
  
  const response = await fetch(scanUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Resolution: options.resolution || 300,
      ColorMode: options.color ? 'Color' : 'Grayscale',
      Format: options.format || 'PDF'
    })
  });
  
  const jobId = response.headers.get('Location');
  
  // Attendre que le scan soit terminé
  let status = 'Processing';
  while (status === 'Processing') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const statusResponse = await fetch(`http://${ipAddress}/Scan/Jobs/${jobId}`);
    const statusData = await statusResponse.json();
    status = statusData.Status;
  }
  
  // Récupérer le fichier scanné
  const fileResponse = await fetch(`http://${ipAddress}/Scan/Jobs/${jobId}/NextDocument`);
  const fileBuffer = await fileResponse.buffer();
  
  return fileBuffer;
}
```

---

## Recommandation par Plateforme

| Plateforme | API Recommandée | Alternative |
|------------|----------------|-------------|
| **macOS** | SANE | Image Capture |
| **Linux** | SANE | - |
| **Windows** | TWAIN | WIA |
| **Scanners Réseau** | API REST du fabricant | - |

---

## Implémentation Multi-Plateforme

Pour supporter plusieurs plateformes, vous pouvez détecter l'OS et utiliser l'API appropriée :

```javascript
import os from 'os';

async function scanDocument(scannerId, options) {
  const platform = os.platform();
  
  switch (platform) {
    case 'darwin': // macOS
      return await scanWithSANE(scannerId, options);
    case 'linux':
      return await scanWithSANE(scannerId, options);
    case 'win32': // Windows
      return await scanWithTWAIN(scannerId, options);
    default:
      throw new Error(`Plateforme non supportée: ${platform}`);
  }
}
```

---

## Prochaines Étapes

1. **Choisir l'API** selon votre plateforme cible
2. **Installer les dépendances** nécessaires
3. **Implémenter la fonction de scan** dans `server.js`
4. **Tester** avec un scanner réel
5. **Gérer les erreurs** (scanner occupé, hors ligne, etc.)

---

## Ressources

- **SANE:** https://www.sane-project.org/
- **TWAIN:** https://www.twain.org/
- **node-sane:** https://www.npmjs.com/package/sane
- **node-twain:** https://www.npmjs.com/package/twain

