import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { getDriverDownloadLinks, getDirectDriverLink } from './getDriverLinks.js';

const execAsync = promisify(exec);

/** Exécute un script PowerShell sur Windows via fichier temporaire (évite EPERM avec -Command long). */
function runPowerShellAsync(script, timeoutMs = 15000) {
  if (os.platform() !== 'win32') {
    return Promise.reject(new Error('runPowerShellAsync uniquement sur Windows'));
  }
  const tmpDir = os.tmpdir();
  const scriptPath = join(tmpDir, `scan-detect-${Date.now()}.ps1`);
  return new Promise((resolve, reject) => {
    fs.writeFile(scriptPath, script, 'utf8', (errWrite) => {
      if (errWrite) {
        reject(errWrite);
        return;
      }
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath.replace(/"/g, '""')}"`;
      execAsync(cmd, { timeout: timeoutMs, windowsHide: true })
        .then(({ stdout, stderr }) => {
          fs.unlink(scriptPath, () => {});
          resolve({ stdout: stdout || '', stderr: stderr || '' });
        })
        .catch((err) => {
          fs.unlink(scriptPath, () => {});
          reject(err);
        });
    });
  });
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadLocalConfig() {
  try {
    const candidates = [];
    if (process.execPath) {
      candidates.push(path.join(path.dirname(process.execPath), 'config.json'));
    }
    candidates.push(path.join(process.cwd(), 'config.json'));
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (cfg.port) process.env.PORT = process.env.PORT || String(cfg.port);
        return cfg;
      }
    }
  } catch (e) {
    // Ignore config load errors
  }
  return {};
}
loadLocalConfig();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Interface pour les scanners
const scannerInterface = {
  // Détecter les scanners USB via system_profiler
  async detectUSBScanners() {
    try {
      const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
      const data = JSON.parse(stdout);
      const scanners = [];

      const extractDevices = (items) => {
        for (const item of items || []) {
          if (item._name && (
            item._name.toLowerCase().includes('scanner') ||
            item._name.toLowerCase().includes('scan') ||
            item._name.toLowerCase().includes('mfp') ||
            item._name.toLowerCase().includes('multifunction')
          )) {
            scanners.push({
              id: `usb-${item._name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
              name: item._name,
              manufacturer: item.manufacturer || item.vendor_id || 'Unknown',
              model: item._name,
              type: 'usb',
              status: 'online',
              capabilities: {
                color: true,
                duplex: false,
                resolution: [150, 200, 300, 600],
                formats: ['PDF', 'JPEG', 'PNG']
              }
            });
          }
          if (item._items) {
            extractDevices(item._items);
          }
        }
      };

      if (data.SPUSBDataType) {
        for (const bus of data.SPUSBDataType) {
          if (bus._items) {
            extractDevices(bus._items);
          }
        }
      }

      return scanners;
    } catch (error) {
      console.error('Erreur détection USB:', error);
      return [];
    }
  },

  // Détecter les scanners via ioreg (plus complet)
  async detectViaIOReg() {
    try {
      const { stdout } = await execAsync('ioreg -p IOUSB -l -w 0');
      const scanners = [];
      const lines = stdout.split('\n');
      
      let currentDevice = null;
      let inScanner = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('+-o')) {
          if (currentDevice && inScanner) {
            scanners.push(currentDevice);
          }
          currentDevice = null;
          inScanner = false;
          
          const deviceName = line.match(/\+-o (.+)/);
          if (deviceName && (
            deviceName[1].toLowerCase().includes('scanner') ||
            deviceName[1].toLowerCase().includes('scan') ||
            deviceName[1].toLowerCase().includes('mfp')
          )) {
            inScanner = true;
            currentDevice = {
              id: `ioreg-${deviceName[1].replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
              name: deviceName[1],
              manufacturer: 'Unknown',
              model: deviceName[1],
              type: 'usb',
              status: 'online',
              capabilities: {
                color: true,
                duplex: false,
                resolution: [150, 200, 300, 600],
                formats: ['PDF', 'JPEG', 'PNG']
              }
            };
          }
        } else if (currentDevice && inScanner) {
          if (line.includes('"USB Vendor Name"')) {
            const match = line.match(/="(.+)"/);
            if (match) currentDevice.manufacturer = match[1];
          }
          if (line.includes('"USB Product Name"')) {
            const match = line.match(/="(.+)"/);
            if (match) currentDevice.model = match[1];
          }
        }
      }

      if (currentDevice && inScanner) {
        scanners.push(currentDevice);
      }

      return scanners;
    } catch (error) {
      console.error('Erreur détection ioreg:', error);
      return [];
    }
  },

  /**
   * Construire un nom lisible à partir du nom de périphérique SANE (ex: hpaio:/usb/HP_LaserJet_Pro_M428 -> HP LaserJet Pro M428).
   */
  _saneDeviceNameToLabel(saneDeviceName) {
    if (!saneDeviceName || typeof saneDeviceName !== 'string') return 'Scanner SANE';
    const s = saneDeviceName.trim();
    // Backend type: hpaio, epson2, canon, etc.
    const backendMatch = s.match(/^([a-z0-9]+):\/?(.*)/i);
    const rest = backendMatch ? backendMatch[2] : s;
    // Remplacer / et _ par des espaces, extraire le dernier segment significatif (souvent modèle)
    const segments = rest.replace(/_/g, ' ').split(/[/?]/).filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.length > 2) return last.replace(/_/g, ' ');
    return s.replace(/_/g, ' ').replace(/^[a-z]+:\/*/i, '') || 'Scanner SANE';
  },

  /**
   * Détecter les scanners via SANE (Scanner Access Now Easy) — Linux et macOS.
   * Exécute "scanimage -L" et parse la liste des périphériques (USB et réseau).
   */
  async _runSANEDetection() {
    const { stdout } = await execAsync('scanimage -L 2>/dev/null || scanimage -L 2>&1', { timeout: 10000 });
    const scanners = [];
    const lineRe1 = /device\s+[`']([^`']+)[`']\s+is\s+a\s+(.+)/i;
    const lineRe2 = /device\s+`([^`]+)'\s+is\s+a\s+(.+)/;
    const lines = (stdout || '').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const m = trimmed.match(lineRe1) || trimmed.match(lineRe2);
      if (!m) continue;
      const saneDeviceName = m[1].trim();
      let description = (m[2] || '').trim();
      if (!description || description.length < 2) description = this._saneDeviceNameToLabel(saneDeviceName);
      const id = `sane-${saneDeviceName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 80)}-${Date.now()}`;
      let manufacturer = 'Unknown';
      let model = description;
      const netMatch = saneDeviceName.match(/ip=([\d.]+)/);
      const ipAddress = netMatch ? netMatch[1] : undefined;
      if (description) {
        const parts = description.split(/\s+/);
        if (parts.length >= 2) {
          manufacturer = parts[0];
          model = parts.slice(1).join(' ');
        }
      }
      const displayName = description || this._saneDeviceNameToLabel(saneDeviceName) || saneDeviceName;
      scanners.push({
        id,
        name: displayName,
        manufacturer,
        model: model || displayName,
        type: 'sane',
        saneDeviceName,
        ipAddress,
        status: 'online',
        capabilities: {
          color: true,
          duplex: true,
          resolution: [150, 200, 300, 600, 1200],
          formats: ['PDF', 'JPEG', 'PNG', 'TIFF']
        }
      });
    }
    return scanners;
  },

  async detectSANEScanners() {
    const platform = os.platform();
    if (platform !== 'linux' && platform !== 'darwin') {
      return [];
    }
    try {
      let scanners = await this._runSANEDetection();
      if (scanners.length === 0) {
        await new Promise(r => setTimeout(r, 1200));
        scanners = await this._runSANEDetection();
      }
      if (scanners.length > 0) {
        console.log(`📷 SANE: ${scanners.length} scanner(s) détecté(s)`);
      }
      return scanners;
    } catch (error) {
      if (error.code !== 'ENOENT' && !/scanimage|command not found/i.test(error.message || '')) {
        console.warn('Détection SANE:', error.message);
      }
      return [];
    }
  },

  // Scanner le réseau pour détecter les scanners réseau
  async detectNetworkScanners() {
    const scanners = [];
    const platform = os.platform();

    // Sous Windows, éviter ifconfig/nc. On ne fait pas de scan réseau agressif par défaut.
    if (platform === 'win32') {
      return scanners;
    }
    
    try {
      // Obtenir les adresses IP locales sans appeler ifconfig (bloqué sur certaines versions de macOS / sandbox).
      const netIfaces = os.networkInterfaces();
      const localIPs = [];
      for (const name of Object.keys(netIfaces)) {
        for (const addr of netIfaces[name] || []) {
          if (addr && addr.family === 'IPv4' && !addr.internal && typeof addr.address === 'string') {
            localIPs.push(addr.address);
          }
        }
      }
      if (localIPs.length === 0) {
        console.warn('Détection réseau: aucune interface IPv4 locale trouvée (os.networkInterfaces).');
        return scanners;
      }

      // Pour chaque IP locale, scanner le sous-réseau par lots (éviter 254 requêtes simultanées)
      const BATCH_SIZE = 30;
      const runBatch = async (ips) => {
        const results = await Promise.all(ips.map(ip => this.checkIPForScanner(ip)));
        return results.filter(s => s !== null);
      };
      for (const localIP of localIPs) {
        const parts = localIP.split('.');
        if (parts.length === 4) {
          const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
          for (let start = 1; start <= 254; start += BATCH_SIZE) {
            const batch = [];
            for (let i = start; i < Math.min(start + BATCH_SIZE, 255); i++) {
              batch.push(`${subnet}.${i}`);
            }
            const batchResults = await runBatch(batch);
            scanners.push(...batchResults);
          }
        }
      }
    } catch (error) {
      console.error('Erreur scan réseau:', error);
    }

    return scanners;
  },

  // Vérifier si une IP contient un scanner réseau
  async checkIPForScanner(ip) {
    try {
      // Essayer de ping l'IP
      const { stdout } = await execAsync(`ping -c 1 -W 1000 ${ip}`, { timeout: 2000 });
      
      if (stdout.includes('1 packets received')) {
        // L'IP répond, vérifier si c'est un scanner
        // Essayer de détecter via des ports communs des scanners
        const ports = [80, 443, 9100, 515, 631]; // HTTP, HTTPS, RAW, LPR, IPP
        
        for (const port of ports) {
          try {
            // Utiliser nc (netcat) pour vérifier si le port est ouvert
            // Sur macOS, nc est disponible par défaut
            const { stdout: nc } = await execAsync(`nc -z -v -G 1 ${ip} ${port} 2>&1`, { timeout: 2000 });
            if (nc.includes('succeeded') || nc.includes('open') || nc.includes('Connection to')) {
              // Probablement un scanner/imprimante réseau
              return {
                id: `network-${ip.replace(/\./g, '-')}-${Date.now()}`,
                name: `Scanner réseau ${ip}`,
                manufacturer: 'Network Scanner',
                model: 'Network Device',
                type: 'network',
                ipAddress: ip,
                status: 'online',
                capabilities: {
                  color: true,
                  duplex: true,
                  resolution: [150, 200, 300, 600],
                  formats: ['PDF', 'JPEG', 'PNG', 'TIFF']
                }
              };
            }
          } catch (e) {
            // Port non accessible ou nc non disponible, continuer
            // Si nc n'est pas disponible, on peut quand même ajouter l'IP si elle répond au ping
          }
        }
        
        // Si l'IP répond mais aucun port scanner détecté, on peut quand même l'ajouter
        // comme scanner potentiel (l'utilisateur pourra le configurer manuellement)
        return {
          id: `network-${ip.replace(/\./g, '-')}-${Date.now()}`,
          name: `Périphérique réseau ${ip}`,
          manufacturer: 'Unknown',
          model: 'Network Device',
          type: 'network',
          ipAddress: ip,
          status: 'online',
          capabilities: {
            color: true,
            duplex: true,
            resolution: [150, 200, 300, 600],
            formats: ['PDF', 'JPEG', 'PNG']
          }
        };
      }
    } catch (error) {
      // IP ne répond pas ou erreur
      return null;
    }
    
    return null;
  },

  // Détecter les scanners TWAIN/WIA sur Windows (inclut Canon, MFD imageRUNNER, etc.)
  async detectTWAINScanners() {
    const scanners = [];
    const platform = os.platform();
    
    if (platform !== 'win32') {
      return scanners; // TWAIN est principalement pour Windows
    }
    
    try {
      // Via PowerShell et WIA (Windows Image Acquisition)
      // Inclure Type 1 (Scanner) ET Type 0 (Unspecified) si nom/description évoque scan/MFD (ex: imageRUNNER)
      const psCommand = `
        $result = @()
        try {
          $wia = New-Object -ComObject WIA.DeviceManager
          foreach ($device in @($wia.DeviceInfos)) {
            try {
              $type = $device.Type
              $name = $null; $manufacturer = $null; $model = $null; $deviceId = $null
              try { $name = $device.Properties.Item("Name").Value } catch {}
              try { $manufacturer = $device.Properties.Item("Manufacturer").Value } catch {}
              try { $model = $device.Properties.Item("Description").Value } catch {}
              try { $deviceId = $device.DeviceID } catch {}
              $text = ($name + " " + $manufacturer + " " + $model) -replace $null,""
              $looksLikeScanner = ($type -eq 1) -or
                ($text -match "(?i)(scan|scanner|mfp|imagerunner|canon|multifunction|imaging)")
              if ($looksLikeScanner -and $deviceId) {
                $isCanon = $manufacturer -like "*Canon*" -or $name -like "*Canon*" -or $model -like "*Canon*" -or $name -like "*imageRUNNER*"
                $result += [PSCustomObject]@{
                  Id = $deviceId
                  Name = if ($name) { $name } else { "Scanner WIA" }
                  Manufacturer = if ($manufacturer) { $manufacturer } else { "Unknown" }
                  Model = if ($model) { $model } else { $name }
                  IsCanon = $isCanon
                }
              }
            } catch {}
          }
        } catch {}
        if ($result.Count -eq 1) { $result[0] | ConvertTo-Json -Compress } else { $result | ConvertTo-Json -Compress }
      `;

      let stdout = '';
      try {
        const out = await runPowerShellAsync(psCommand, 15000);
        stdout = out.stdout || '';
      } catch (e) {
        console.warn('Erreur détection TWAIN/WIA:', e.message);
      }
      let devices = [];
      try {
        if (stdout && stdout.trim() && stdout.trim() !== 'null') {
          const parsed = JSON.parse(stdout);
          devices = Array.isArray(parsed) ? parsed : (parsed && (parsed.Id || parsed.Name) ? [parsed] : []);
        }
      } catch (e) {
        console.warn('Parse JSON WIA échoué:', e.message);
        devices = [];
      }
      
      const processDevice = (device) => {
        const isCanon = device.IsCanon || 
                       device.Manufacturer?.toLowerCase().includes('canon') ||
                       device.Name?.toLowerCase().includes('canon') ||
                       device.Model?.toLowerCase().includes('canon');
        
        // Capacités spécifiques pour Canon
        const capabilities = {
          color: true,
          duplex: isCanon ? true : true, // Canon supporte généralement le duplex
          resolution: isCanon ? [150, 200, 300, 400, 600, 1200, 2400] : [150, 200, 300, 600, 1200],
          formats: ['PDF', 'JPEG', 'PNG', 'TIFF']
        };
        
        // Ajouter des formats spécifiques Canon si disponible
        if (isCanon) {
          capabilities.formats.push('PDF/A'); // Canon supporte souvent PDF/A
        }
        
        const safeId = (device.Id && String(device.Id).trim()) ? String(device.Id).replace(/[^a-zA-Z0-9]/g, '-') : 'pnp';
        return {
          id: `twain-${safeId}-${Date.now()}`,
          name: device.Name || 'Scanner TWAIN',
          manufacturer: device.Manufacturer || 'Unknown',
          model: device.Model || device.Description || 'Unknown Model',
          type: 'twain',
          twainDeviceId: device.Id,
          isCanon: isCanon,
          status: 'online',
          capabilities: capabilities
        };
      };
      
      if (Array.isArray(devices)) {
        devices.forEach(device => {
          scanners.push(processDevice(device));
        });
      } else if (devices && (devices.Id || devices.Name)) {
        scanners.push(processDevice(devices));
      }

      // Fallback: si WIA ne retourne rien, lister les imprimantes/scanners Windows (Paramètres > Imprimantes et scanners)
      // pour que les MFD (ex: imageRUNNER 2206N) apparaissent dans l'app; le scan matchera par nom dans WIA
      if (scanners.length === 0) {
        const psPrinters = `
          $out = @()
          try {
            Get-PnpDevice -Class Printer -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' } | ForEach-Object {
              $n = $_.FriendlyName
              if ($n -match "(?i)(scan|scanner|mfp|imagerunner|canon|multifunction|imaging|2206)") {
                $out += [PSCustomObject]@{ Id = ""; Name = $n; Manufacturer = "Unknown"; Model = $n; IsCanon = ($n -match "(?i)canon|imagerunner") }
              }
            }
            Get-PnpDevice -Class Image -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' } | ForEach-Object {
              $n = $_.FriendlyName
              $out += [PSCustomObject]@{ Id = ""; Name = $n; Manufacturer = "Unknown"; Model = $n; IsCanon = ($n -match "(?i)canon|imagerunner") }
            }
          } catch {}
          if ($out.Count -eq 1) { $out[0] | ConvertTo-Json -Compress } else { $out | ConvertTo-Json -Compress }
        `;
        try {
          let pout = '';
          try {
            const out = await runPowerShellAsync(psPrinters, 10000);
            pout = out.stdout || '';
          } catch {}
          let fallbackDevices = [];
          if (pout && pout.trim() && pout.trim() !== 'null') {
            try {
              const parsed = JSON.parse(pout);
              fallbackDevices = Array.isArray(parsed) ? parsed : (parsed && parsed.Name ? [parsed] : []);
            } catch {}
          }
          fallbackDevices.forEach(device => {
            if (device && device.Name) {
              scanners.push(processDevice({
                Id: device.Id || `pnp-${(device.Name || '').replace(/[^a-zA-Z0-9]/g, '-')}`,
                Name: device.Name,
                Manufacturer: device.Manufacturer || 'Unknown',
                Model: device.Model || device.Name,
                IsCanon: device.IsCanon || /canon|imagerunner/i.test(device.Name || '')
              }));
            }
          });
          if (scanners.length > 0) {
            console.log(`📷 ${scanners.length} scanner(s) trouvé(s) via liste PnP (Imprimantes et scanners)`);
          }
        } catch (e) {
          console.warn('Fallback PnP imprimantes/scanners:', e.message);
        }
      }
      
      if (scanners.length > 0) {
        const canonScanners = scanners.filter(s => s.isCanon);
        if (canonScanners.length > 0) {
          console.log(`📷 ${canonScanners.length} scanner(s) Canon/imageRUNNER détecté(s)`);
        }
      }
    } catch (error) {
      console.warn('Erreur détection TWAIN/WIA:', error.message);
    }
    
    return scanners;
  },

  // Détecter les scanners via les pilotes du fabricant (Windows Device Manager)
  // Détecte notamment les scanners Canon avec leurs pilotes spécifiques
  async detectVendorDriverScanners() {
    const scanners = [];
    const platform = os.platform();
    
    if (platform !== 'win32') {
      return scanners;
    }
    
    try {
      // Utiliser PowerShell pour lister les scanners via Device Manager
      const psCommand = `
        Get-PnpDevice -Class Image | Where-Object { $_.Status -eq 'OK' } | ForEach-Object {
          $device = $_
          $friendlyName = $device.FriendlyName
          $instanceId = $device.InstanceId
          $status = $device.Status
          
          # Extraire le fabricant et le modèle
          $parts = $friendlyName -split ' ', 2
          $manufacturer = if ($parts.Length -gt 0) { $parts[0] } else { 'Unknown' }
          $model = if ($parts.Length -gt 1) { $parts[1] } else { $friendlyName }
          
          # Détecter Canon
          $isCanon = $manufacturer -like "*Canon*" -or $friendlyName -like "*Canon*" -or $model -like "*Canon*"
          
          [PSCustomObject]@{
            FriendlyName = $friendlyName
            InstanceId = $instanceId
            Status = $status
            Manufacturer = $manufacturer
            Model = $model
            IsCanon = $isCanon
          }
        } | ConvertTo-Json -Compress
      `;

      let stdout = '';
      try {
        const out = await runPowerShellAsync(psCommand, 15000);
        stdout = out.stdout || '';
      } catch (e) {
        console.warn('Erreur détection pilotes fabricant:', e.message);
      }
      if (stdout && stdout.trim() && stdout.trim() !== 'null') {
        const devices = JSON.parse(stdout);
        const deviceArray = Array.isArray(devices) ? devices : [devices];
        
        deviceArray.forEach(device => {
          if (device && device.FriendlyName) {
            const isCanon = device.IsCanon || 
                           device.Manufacturer?.toLowerCase().includes('canon') ||
                           device.FriendlyName?.toLowerCase().includes('canon') ||
                           device.Model?.toLowerCase().includes('canon');
            
            // Capacités spécifiques pour Canon
            const capabilities = {
              color: true,
              duplex: isCanon ? true : true,
              resolution: isCanon ? [150, 200, 300, 400, 600, 1200, 2400] : [150, 200, 300, 600, 1200],
              formats: ['PDF', 'JPEG', 'PNG', 'TIFF']
            };
            
            if (isCanon) {
              capabilities.formats.push('PDF/A');
            }
            
            scanners.push({
              id: `vendor-${device.InstanceId.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`,
              name: device.FriendlyName,
              manufacturer: device.Manufacturer || 'Unknown',
              model: device.Model || device.FriendlyName,
              type: 'vendor-driver',
              instanceId: device.InstanceId,
              isCanon: isCanon,
              status: device.Status === 'OK' ? 'online' : 'offline',
              capabilities: capabilities
            });
          }
        });
        
        // Log pour debug
        const canonScanners = scanners.filter(s => s.isCanon);
        if (canonScanners.length > 0) {
          console.log(`📷 ${canonScanners.length} scanner(s) Canon détecté(s) via pilotes fabricant`);
        }
      }

      // Fallback WMI/CIM: certains scanners apparaissent comme WSD Scan Device / Imaging
      if (scanners.length === 0) {
        const psFallback = `
          $results = @()
          try {
            $wmi = Get-CimInstance Win32_PnPEntity | Where-Object {
              $_.Name -match '(?i)(scan|imagerunner|mf|wsd|canon)' -or $_.ClassGuid -eq '{6bdd1fc6-810f-11d0-bec7-08002be2092f}'
            }
            foreach ($d in $wmi) {
              $name = $d.Name
              $id = $d.PNPDeviceID
              $mfr = $d.Manufacturer
              $isCanon = ($name -match '(?i)canon') -or ($mfr -match '(?i)canon')
              $results += [PSCustomObject]@{
                FriendlyName = $name
                InstanceId = $id
                Status = 'OK'
                Manufacturer = if ($mfr) { $mfr } else { 'Unknown' }
                Model = $name
                IsCanon = $isCanon
              }
            }
          } catch {}
          $results | ConvertTo-Json -Compress
        `;

        let wmiOut = '';
        try {
          const out = await runPowerShellAsync(psFallback, 15000);
          wmiOut = out.stdout || '';
        } catch {}
        if (wmiOut && wmiOut.trim() && wmiOut.trim() !== 'null') {
          const wmiDevices = JSON.parse(wmiOut);
          const arr = Array.isArray(wmiDevices) ? wmiDevices : [wmiDevices];
          arr.forEach(device => {
            if (!device || !device.FriendlyName) return;
            const isCanon = device.IsCanon ||
              device.Manufacturer?.toLowerCase().includes('canon') ||
              device.FriendlyName?.toLowerCase().includes('canon') ||
              device.Model?.toLowerCase().includes('canon');

            scanners.push({
              id: `vendor-${(device.InstanceId || device.FriendlyName).replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`,
              name: device.FriendlyName,
              manufacturer: device.Manufacturer || 'Unknown',
              model: device.Model || device.FriendlyName,
              type: 'vendor-driver',
              instanceId: device.InstanceId || null,
              isCanon,
              status: 'online',
              capabilities: {
                color: true,
                duplex: true,
                resolution: isCanon ? [150, 200, 300, 400, 600, 1200] : [150, 200, 300, 600],
                formats: ['PDF', 'JPEG', 'PNG', 'TIFF']
              }
            });
          });
        }
      }
    } catch (error) {
      console.warn('Erreur détection pilotes fabricant:', error.message);
    }
    
    return scanners;
  },

  // Scanner un document avec TWAIN (Windows)
  async scanWithTWAIN(scannerId, scanner, options) {
    const platform = os.platform();
    
    if (platform !== 'win32') {
      throw new Error('TWAIN n\'est disponible que sur Windows');
    }
    
    try {
      // Utiliser PowerShell avec WIA pour scanner. On sauve d'abord en .bmp (compatible tous pilotes) puis on convertit si besoin.
      const tempDir = os.tmpdir();
      const outFormat = (options.format || 'jpg').toString().toLowerCase();
      const tempBmp = path.join(tempDir, `scan_${Date.now()}.bmp`);
      const tempOut = path.join(tempDir, `scan_out_${Date.now()}.${outFormat === 'pdf' ? 'jpg' : outFormat}`);
      const tempBmpEsc = tempBmp.replace(/\\/g, '\\\\');
      const tempOutEsc = tempOut.replace(/\\/g, '\\\\');
      const pageSizeMap = { A4: 0, A3: 1, Letter: 2, Legal: 3, Auto: 255 };
      const wiaPageSize = pageSizeMap[(options.pageSize || 'A4').toString()] ?? 0;
      const imageScaleMode = (options.imageScaleMode || 'fill-page').toString().toLowerCase();
      const scaleExpr = imageScaleMode === 'fill-width' ? '$targetW / $w' :
        imageScaleMode === 'fill-height' ? '$targetH / $h' :
        imageScaleMode === 'fit' ? '[Math]::Min($targetW / $w, $targetH / $h)' :
        '[Math]::Max($targetW / $w, $targetH / $h)';

      const psCommand = `
        Add-Type -AssemblyName System.Drawing
        Add-Type -AssemblyName System.Drawing.Imaging
        $wia = New-Object -ComObject WIA.DeviceManager

        $targetId = "${(scanner.twainDeviceId || '').replace(/"/g, '\\"')}"
        $targetName = "${(scanner.name || '').replace(/"/g, '\\"')}"
        $targetModel = "${(scanner.model || '').replace(/"/g, '\\"')}"
        $looksCanon = ${((scanner.manufacturer && scanner.manufacturer.toLowerCase().includes('canon')) || (scanner.name && scanner.name.toLowerCase().includes('canon')) || (scanner.model && scanner.model.toLowerCase().includes('canon'))) ? '$true' : '$false'}

        $device = $null

        # Fonction d'aide: correspondance floue Nom/Modèle
        function Matches-Fuzzy($value, $pattern) {
          if ([string]::IsNullOrWhiteSpace($value) -or [string]::IsNullOrWhiteSpace($pattern)) { return $false }
          $v = $value.ToLower()
          $p = $pattern.ToLower()
          if ($v -like "*$p*") { return $true }
          $tokens = ($p -replace '[^a-z0-9]+',' ').Trim().Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
          foreach ($t in $tokens) {
            if ($t.Length -gt 2 -and $v -notlike "*$t*") { return $false }
          }
          return $true
        }

        foreach ($di in $wia.DeviceInfos) {
          $name = $null; $desc = $null
          try { $name = $di.Properties.Item("Name").Value } catch {}
          try { $desc = $di.Properties.Item("Description").Value } catch {}
          if ([string]::IsNullOrWhiteSpace($targetId) -eq $false -and $di.DeviceID -eq $targetId) { $device = $di.Connect(); break }
          if (-not $device -and [string]::IsNullOrWhiteSpace($targetName) -eq $false) {
            if ( (Matches-Fuzzy $name $targetName) -or (Matches-Fuzzy $desc $targetName) ) { $device = $di.Connect(); break }
          }
          if (-not $device -and [string]::IsNullOrWhiteSpace($targetModel) -eq $false) {
            if ( (Matches-Fuzzy $desc $targetModel) -or (Matches-Fuzzy $name $targetModel) ) { $device = $di.Connect(); break }
          }
        }

        if (-not $device -and $looksCanon) {
          foreach ($di in $wia.DeviceInfos) {
            $name = $null; $desc = $null; $mfr = $null
            try { $name = $di.Properties.Item("Name").Value } catch {}
            try { $desc = $di.Properties.Item("Description").Value } catch {}
            try { $mfr = $di.Properties.Item("Manufacturer").Value } catch {}
            $all = ($name + ' ' + $desc + ' ' + $mfr)
            if ($all -and ($all.ToLower() -like "*canon*")) { $device = $di.Connect(); break }
          }
        }

        if (-not $device) { throw "Périphérique TWAIN/WIA introuvable (ID/Nom/Modèle)" }

        # Taille de page WIA (3099 = WIA_IPS_PAGE_SIZE) : 0=A4, 1=A3, 2=Letter, 3=Legal, 255=Auto
        $wiaPageSize = ${wiaPageSize}
        try { $device.Properties.Item("3099").Value = $wiaPageSize } catch {}

        # Etendue pleine page en pixels : on l'applique si le pilote rapporte une zone trop petite (ex. moitie de page)
        $dpiRes = ${options.resolution || 300}
        $mmPerInch = 25.4
        $fullPagePixW = 0; $fullPagePixH = 0
        if ($wiaPageSize -eq 0) { $fullPagePixW = [int](210 / $mmPerInch * $dpiRes); $fullPagePixH = [int](297 / $mmPerInch * $dpiRes) }
        elseif ($wiaPageSize -eq 1) { $fullPagePixW = [int](297 / $mmPerInch * $dpiRes); $fullPagePixH = [int](420 / $mmPerInch * $dpiRes) }
        elseif ($wiaPageSize -eq 2) { $fullPagePixW = [int](215.9 / $mmPerInch * $dpiRes); $fullPagePixH = [int](279.4 / $mmPerInch * $dpiRes) }
        elseif ($wiaPageSize -eq 3) { $fullPagePixW = [int](215.9 / $mmPerInch * $dpiRes); $fullPagePixH = [int](355.6 / $mmPerInch * $dpiRes) }
        $minExtentW = if ($fullPagePixW -gt 0) { [int]($fullPagePixW * 0.9) } else { 600 }
        $minExtentH = if ($fullPagePixH -gt 0) { [int]($fullPagePixH * 0.9) } else { 600 }

        # Source : bac = chargeur (ADF), vitre = plateau.
        # WIA : 3088 = DocumentHandlingSelect (1 = FEEDER, 2 = FLATBED ; certains pilotes inversent).
        # 3087 = DocumentHandlingCapabilities (lecture, bit 1 = FEED). 3096/3097 = Pages.
        $wantBac = ("${(options.scanSource || 'vitre').toLowerCase()}" -eq "bac")
        $image = $null
        $lastErr = $null
        if ($wantBac) {
          # Detector les items qui supportent le chargeur (3087 = capabilities, bit 1 = FEED)
          $feederIndices = [System.Collections.ArrayList]@()
          $otherIndices = [System.Collections.ArrayList]@()
          foreach ($idx in 1..5) {
            $it = $null
            try { $it = $device.Items.Item($idx) } catch { $otherIndices.Add($idx) | Out-Null; continue }
            if (-not $it) { $otherIndices.Add($idx) | Out-Null; continue }
            $cap = 0
            try { $cap = [int]$it.Properties.Item("3087").Value } catch {}
            try { if ($cap -eq 0) { $cap = [int]$it.Properties.Item("3096").Value } } catch {}
            if (($cap -band 1) -eq 1) { $feederIndices.Add($idx) | Out-Null } else { $otherIndices.Add($idx) | Out-Null }
          }
          $indicesToTry = $feederIndices + $otherIndices
          if ($indicesToTry.Count -eq 0) { $indicesToTry = @(1, 2, 3, 4, 5) }
          $docHandlingValues = @(1, 2)
          $pagesValues = @(0, 1)
          Start-Sleep -Milliseconds 1000
          :outerBac foreach ($docVal in $docHandlingValues) {
            try { $device.Properties.Item("3088").Value = $docVal } catch {}
            try { $device.Properties.Item("3097").Value = 0 } catch {}
            try { $device.Properties.Item("3099").Value = $wiaPageSize } catch {}
            Start-Sleep -Milliseconds 500
            foreach ($pagesVal in $pagesValues) {
              if ($image) { break outerBac }
              try { $device.Properties.Item("3097").Value = $pagesVal } catch {}
              foreach ($tryIdx in $indicesToTry) {
                $item = $null
                try { $item = $device.Items.Item($tryIdx) } catch { $lastErr = $_; continue }
                if (-not $item) { continue }
                try { $item.Properties.Item("3099").Value = $wiaPageSize } catch {}
                try { $item.Properties.Item("3088").Value = $docVal } catch {}
                try { $item.Properties.Item("3096").Value = 1 } catch {}
                try { $item.Properties.Item("3097").Value = $pagesVal } catch {}
                try { $item.Properties.Item("6146").Value = ${options.resolution || 300} } catch {}
                try { $item.Properties.Item("6147").Value = ${options.resolution || 300} } catch {}
                try { $item.Properties.Item("6148").Value = ${options.color !== false ? 1 : 0} } catch {}
                try { $item.Properties.Item("6149").Value = 0 } catch {}
                try { $item.Properties.Item("6150").Value = 0 } catch {}
                $curX = 0; $curY = 0
                try { $curX = [int]$item.Properties.Item("6151").Value } catch {}
                try { $curY = [int]$item.Properties.Item("6152").Value } catch {}
                if ($fullPagePixW -gt 0 -and $fullPagePixH -gt 0 -and ($curX -lt $minExtentW -or $curY -lt $minExtentH)) {
                  try { $item.Properties.Item("6151").Value = $fullPagePixW } catch {}
                  try { $item.Properties.Item("6152").Value = $fullPagePixH } catch {}
                }
                Start-Sleep -Milliseconds 350
                try {
                  $image = $item.Transfer()
                  break outerBac
                } catch { $lastErr = $_; continue }
              }
            }
          }
          if (-not $image) {
            Start-Sleep -Milliseconds 800
            :retryBac foreach ($r in 1..4) {
              foreach ($docVal in @(1, 2)) {
                try { $device.Properties.Item("3088").Value = $docVal } catch {}
                try { $device.Properties.Item("3099").Value = $wiaPageSize } catch {}
                Start-Sleep -Milliseconds 600
                foreach ($tryIdx in @(1, 2, 3, 4, 5)) {
                  $item = $null
                  try { $item = $device.Items.Item($tryIdx) } catch { continue }
                  if (-not $item) { continue }
                  try { $item.Properties.Item("3099").Value = $wiaPageSize } catch {}
                  try { $item.Properties.Item("3088").Value = $docVal } catch {}
                  try { $item.Properties.Item("6146").Value = ${options.resolution || 300} } catch {}
                  try { $item.Properties.Item("6147").Value = ${options.resolution || 300} } catch {}
                  try { $item.Properties.Item("6148").Value = ${options.color !== false ? 1 : 0} } catch {}
                  try { $item.Properties.Item("6149").Value = 0 } catch {}
                  try { $item.Properties.Item("6150").Value = 0 } catch {}
                  $curX = 0; $curY = 0
                  try { $curX = [int]$item.Properties.Item("6151").Value } catch {}
                  try { $curY = [int]$item.Properties.Item("6152").Value } catch {}
                  if ($fullPagePixW -gt 0 -and $fullPagePixH -gt 0 -and ($curX -lt $minExtentW -or $curY -lt $minExtentH)) {
                    try { $item.Properties.Item("6151").Value = $fullPagePixW } catch {}
                    try { $item.Properties.Item("6152").Value = $fullPagePixH } catch {}
                  }
                  Start-Sleep -Milliseconds 300
                  try {
                    $image = $item.Transfer()
                    break retryBac
                  } catch { continue }
                }
              }
              if ($image) { break }
              Start-Sleep -Milliseconds 1200
            }
          }
        } else {
          $docHandling = 2
          try { $device.Properties.Item("3088").Value = $docHandling } catch {}
          try { $device.Properties.Item("3096").Value = 1 } catch {}
          foreach ($tryIdx in @(1, 2, 3)) {
            $item = $null
            try { $item = $device.Items.Item($tryIdx) } catch { $lastErr = $_; continue }
            if (-not $item) { continue }
            try { $item.Properties.Item("3088").Value = $docHandling } catch {}
            try { $item.Properties.Item("3096").Value = 1 } catch {}
            try { $item.Properties.Item("6146").Value = ${options.resolution || 300} } catch {}
            try { $item.Properties.Item("6147").Value = ${options.resolution || 300} } catch {}
            try { $item.Properties.Item("6148").Value = ${options.color !== false ? 1 : 0} } catch {}
            try { $item.Properties.Item("6149").Value = 0 } catch {}
            try { $item.Properties.Item("6150").Value = 0 } catch {}
            $curX = 0; $curY = 0
            try { $curX = [int]$item.Properties.Item("6151").Value } catch {}
            try { $curY = [int]$item.Properties.Item("6152").Value } catch {}
            if ($fullPagePixW -gt 0 -and $fullPagePixH -gt 0 -and ($curX -lt $minExtentW -or $curY -lt $minExtentH)) {
              try { $item.Properties.Item("6151").Value = $fullPagePixW } catch {}
              try { $item.Properties.Item("6152").Value = $fullPagePixH } catch {}
            }
            try {
              $image = $item.Transfer()
              break
            } catch { $lastErr = $_; continue }
          }
        }
        if (-not $image) {
          if ($wantBac) {
            throw "Bac ADF : aucun scan. Verifiez feuilles dans le chargeur (en haut), chargeur ferme, puis reessayez. Certains pilotes : desactivez le chargeur dans le logiciel du fabricant puis reactivez-le."
          } else {
            throw "Vitre : impossible de lancer le scan."
          }
        }

        # Sauvegarder en BMP (compatible tous pilotes WIA)
        $image.SaveFile("${tempBmpEsc}")

        # Charger le BMP, appliquer orientation puis sauver au format demandé (jpeg/png)
        # Orientation : portrait = hauteur > largeur ; paysage = largeur > hauteur.
        # - portrait : si l'image est en paysage (w>h), rotation -90° pour obtenir portrait.
        # - landscape/paysage : si l'image est en portrait (h>w), rotation +90° pour obtenir paysage.
        # - auto : pour A4/A3/Letter/Legal, si l'image scannée est en paysage (w>h), on normalise en portrait.
        $bmp = [System.Drawing.Bitmap]::FromFile("${tempBmpEsc}")
        $w = $bmp.Width; $h = $bmp.Height
        $orient = ("${(options.orientation || 'auto').toString().trim().toLowerCase()}" -replace 'paysage','landscape').Trim()
        if ($orient -ne 'portrait' -and $orient -ne 'landscape') { $orient = 'auto' }
        $standardPage = ($wiaPageSize -eq 0 -or $wiaPageSize -eq 1 -or $wiaPageSize -eq 2 -or $wiaPageSize -eq 3)
        $autoPortrait = ($orient -eq "auto" -and $standardPage -and $w -gt $h)
        $wantPortrait = ($orient -eq "portrait" -and $w -gt $h) -or $autoPortrait
        $wantLandscape = ($orient -eq "landscape" -and $h -gt $w)
        if ($wantPortrait) {
          $rotated = New-Object System.Drawing.Bitmap($h, $w)
          $g = [System.Drawing.Graphics]::FromImage($rotated)
          $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $g.TranslateTransform($h/2, $w/2)
          $g.RotateTransform(-90)
          $g.TranslateTransform(-$w/2, -$h/2)
          $g.DrawImage($bmp, 0, 0, $w, $h)
          $g.Dispose(); $bmp.Dispose(); $bmp = $rotated
        } elseif ($wantLandscape) {
          $rotated = New-Object System.Drawing.Bitmap($h, $w)
          $g = [System.Drawing.Graphics]::FromImage($rotated)
          $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $g.TranslateTransform($h/2, $w/2)
          $g.RotateTransform(90)
          $g.TranslateTransform(-$w/2, -$h/2)
          $g.DrawImage($bmp, 0, 0, $w, $h)
          $g.Dispose(); $bmp.Dispose(); $bmp = $rotated
        }
        $w = $bmp.Width; $h = $bmp.Height

        # Normaliser les dimensions au format de page (A4, Letter, etc.) si demandé
        $dpi = ${options.resolution || 300}
        $mmPerInch = 25.4
        if ($wiaPageSize -eq 0) {
          $targetWPortrait = [int](210 / $mmPerInch * $dpi)
          $targetHPortrait = [int](297 / $mmPerInch * $dpi)
          $targetW = $targetWPortrait; $targetH = $targetHPortrait
          if ($w -gt $h) { $targetW = $targetHPortrait; $targetH = $targetWPortrait }
        } elseif ($wiaPageSize -eq 1) {
          $targetWPortrait = [int](297 / $mmPerInch * $dpi)
          $targetHPortrait = [int](420 / $mmPerInch * $dpi)
          $targetW = $targetWPortrait; $targetH = $targetHPortrait
          if ($w -gt $h) { $targetW = $targetHPortrait; $targetH = $targetWPortrait }
        } elseif ($wiaPageSize -eq 2) {
          $targetWPortrait = [int](215.9 / $mmPerInch * $dpi)
          $targetHPortrait = [int](279.4 / $mmPerInch * $dpi)
          $targetW = $targetWPortrait; $targetH = $targetHPortrait
          if ($w -gt $h) { $targetW = $targetHPortrait; $targetH = $targetWPortrait }
        } elseif ($wiaPageSize -eq 3) {
          $targetWPortrait = [int](215.9 / $mmPerInch * $dpi)
          $targetHPortrait = [int](355.6 / $mmPerInch * $dpi)
          $targetW = $targetWPortrait; $targetH = $targetHPortrait
          if ($w -gt $h) { $targetW = $targetHPortrait; $targetH = $targetWPortrait }
        } else {
          $targetW = 0; $targetH = 0
        }
        # Ne pas normaliser si le scan est clairement partiel (pilote a renvoye une petite zone) : eviter un grand fond blanc avec le contenu au centre
        $isPartialScan = ($targetW -gt 0 -and $targetH -gt 0 -and ($w -lt 0.6 * $targetW -or $h -lt 0.6 * $targetH))
        if (-not $isPartialScan -and $targetW -gt 0 -and $targetH -gt 0 -and ($w -ne $targetW -or $h -ne $targetH)) {
          $scaled = New-Object System.Drawing.Bitmap($targetW, $targetH)
          $g2 = [System.Drawing.Graphics]::FromImage($scaled)
          $g2.Clear([System.Drawing.Color]::White)
          $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          # Mise à l'échelle selon le paramètre (fill-width | fill-height | fill-page | fit)
          $scale = ${scaleExpr}
          $drawW = [int]($w * $scale)
          $drawH = [int]($h * $scale)
          $x = [int](($targetW - $drawW) / 2)
          $y = [int](($targetH - $drawH) / 2)
          $g2.DrawImage($bmp, $x, $y, $drawW, $drawH)
          $g2.Dispose(); $bmp.Dispose(); $bmp = $scaled
        }

        $fmt = [System.Drawing.Imaging.ImageFormat]::Jpeg
        if ("${outFormat}" -eq "png") { $fmt = [System.Drawing.Imaging.ImageFormat]::Png }
        if ("${outFormat}" -eq "tiff") { $fmt = [System.Drawing.Imaging.ImageFormat]::Tiff }
        $bmp.Save("${tempOutEsc}", $fmt)
        $bmp.Dispose()
        Remove-Item -Path "${tempBmpEsc}" -Force -ErrorAction SilentlyContinue
        Write-Output "${tempOutEsc}"
      `;
      
      const { stdout } = await runPowerShellAsync(psCommand, 60000);
      const outputFile = stdout.trim();
      
      if (fs.existsSync(outputFile)) {
        let fileBuffer = fs.readFileSync(outputFile);
        try { fs.unlinkSync(outputFile); } catch {}
        const fmt = (options.format || 'jpg').toString().toLowerCase();
        let actualExt = fmt === 'pdf' ? 'jpg' : fmt;
        let actualMime = actualExt === 'png' ? 'image/png' : actualExt === 'tiff' ? 'image/tiff' : 'image/jpeg';

        if (fmt === 'pdf') {
          const pdfDoc = await PDFDocument.create();
          const image = await pdfDoc.embedJpg(fileBuffer);
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
          const pdfBytes = await pdfDoc.save();
          fileBuffer = Buffer.from(pdfBytes);
          actualExt = 'pdf';
          actualMime = 'application/pdf';
        }

        return {
          buffer: fileBuffer,
          fileName: `scan_${Date.now()}.${actualExt}`,
          mimeType: actualMime
        };
      } else {
        throw new Error('Le fichier scanné n\'a pas été créé');
      }
    } catch (error) {
      console.error('Erreur scan TWAIN:', error);
      throw new Error(`Erreur lors du scan: ${error.message}`);
    }
  },

  // Scanner un document via SANE sur un scanner réseau (Linux/macOS, sans pilote fabricant)
  async scanWithSANENetwork(scannerId, scanner, options) {
    const platform = os.platform();
    if (platform !== 'linux' && platform !== 'darwin') {
      throw new Error('Scan SANE réseau disponible uniquement sur Linux et macOS.');
    }
    const ip = scanner.ipAddress || scanner.ip;
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      throw new Error('Adresse IP du scanner réseau manquante ou invalide.');
    }
    const format = options.format?.toLowerCase() || 'jpeg';
    const tempFile = path.join(os.tmpdir(), `scan_${Date.now()}.${format}`);
    // SANE backend "net" : device name = net:IP ou net:hostname
    const deviceName = `net:${ip}`;
    let command = `scanimage --device-name="${deviceName}" --resolution ${options.resolution || 300}`;
    if (options.color === false) {
      command += ' --mode Gray';
    } else {
      command += ' --mode Color';
    }
    command += ` --format=${format} > "${tempFile}"`;
    try {
      await execAsync(command, { timeout: 60000 });
      if (fs.existsSync(tempFile)) {
        const fileBuffer = fs.readFileSync(tempFile);
        fs.unlinkSync(tempFile);
        return {
          buffer: fileBuffer,
          fileName: `scan_${Date.now()}.${format}`,
          mimeType: format === 'pdf' ? 'application/pdf' :
                   format === 'png' ? 'image/png' :
                   format === 'tiff' ? 'image/tiff' :
                   'image/jpeg'
        };
      }
      throw new Error('Le fichier scanné n\'a pas été créé.');
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes('Invalid argument') || msg.includes('No such device')) {
        throw new Error(`Scanner réseau ${ip} non accessible via SANE. Vérifiez que SANE (sane-backends) et le backend "net" sont installés, et que le scanner est sur le même réseau.`);
      }
      throw new Error(`Erreur scan SANE réseau: ${msg}`);
    }
  },

  // Scanner avec les pilotes du fabricant (via scanimage ou outils système)
  async scanWithVendorDriver(scannerId, scanner, options) {
    const platform = os.platform();
    
    try {
      if (platform === 'win32') {
        // Sur Windows, utiliser WIA comme pour TWAIN
        return await this.scanWithTWAIN(scannerId, scanner, options);
      } else if (platform === 'darwin' || platform === 'linux') {
        // Sur macOS/Linux, utiliser scanimage (SANE)
        const format = options.format?.toLowerCase() || 'jpeg';
        const tempFile = path.join(os.tmpdir(), `scan_${Date.now()}.${format}`);
        
        // Nom du périphérique SANE (détection SANE fournit saneDeviceName, ex: "genesys:libusb:001:003" ou "net:192.168.1.100")
        const scannerName = scanner.saneDeviceName || scanner.name || scanner.instanceId || 'default';
        
        let command = `scanimage --device-name="${scannerName.replace(/"/g, '\\"')}" --resolution ${options.resolution || 300}`;
        
        if (options.color === false) {
          command += ' --mode Gray';
        } else {
          command += ' --mode Color';
        }
        
        command += ` --format=${format} > "${tempFile}"`;
        
        await execAsync(command, { timeout: 60000 });
        
        if (fs.existsSync(tempFile)) {
          const fileBuffer = fs.readFileSync(tempFile);
          fs.unlinkSync(tempFile);
          
          return {
            buffer: fileBuffer,
            fileName: `scan_${Date.now()}.${format}`,
            mimeType: format === 'pdf' ? 'application/pdf' :
                     format === 'png' ? 'image/png' :
                     format === 'tiff' ? 'image/tiff' :
                     'image/jpeg'
          };
        } else {
          throw new Error('Le fichier scanné n\'a pas été créé');
        }
      } else {
        throw new Error(`Plateforme non supportée: ${platform}`);
      }
    } catch (error) {
      console.error('Erreur scan pilote fabricant:', error);
      throw new Error(`Erreur lors du scan: ${error.message}`);
    }
  },

  // Vérifier le statut d'un scanner
  async checkScannerStatus(scanner) {
    if (scanner.type === 'sane' && scanner.saneDeviceName) {
      try {
        const { stdout } = await execAsync('scanimage -L 2>/dev/null || scanimage -L 2>&1', { timeout: 5000 });
        return (stdout || '').includes(scanner.saneDeviceName) ? 'online' : 'offline';
      } catch {
        return 'offline';
      }
    }
    if (scanner.type === 'network' && scanner.ipAddress) {
      try {
        const platform = os.platform();
        if (platform === 'win32') {
          const { stdout } = await execAsync(`ping -n 1 ${scanner.ipAddress}`, { timeout: 2000 });
          return stdout.includes('TTL') ? 'online' : 'offline';
        } else {
        const { stdout } = await execAsync(`ping -c 1 -W 1000 ${scanner.ipAddress}`, { timeout: 2000 });
        return stdout.includes('1 packets received') ? 'online' : 'offline';
        }
      } catch {
        return 'offline';
      }
    } else if (scanner.type === 'usb' || scanner.type === 'twain' || scanner.type === 'vendor-driver') {
      // Pour USB/TWAIN/Vendor, vérifier si le périphérique est toujours présent
      const platform = os.platform();
      
      if (platform === 'win32' && scanner.instanceId) {
        try {
          const psCommand = `Get-PnpDevice -InstanceId "${scanner.instanceId}" | Select-Object -ExpandProperty Status`;
          const { stdout } = await runPowerShellAsync(psCommand, 2000);
          return stdout.trim() === 'OK' ? 'online' : 'offline';
        } catch {
          return 'online'; // Par défaut, considérer comme en ligne
        }
      }
      
      return 'online';
    }
    return 'offline';
  }
};

// Endpoints de debug Windows pour aider au diagnostic
app.get('/api/scanners/debug/windows', async (req, res) => {
  try {
    if (os.platform() !== 'win32') {
      return res.status(400).json({ error: 'Disponible uniquement sous Windows' });
    }

    const psWia = `
      try {
        $wia = New-Object -ComObject WIA.DeviceManager
        $list = @()
        foreach ($di in @($wia.DeviceInfos)) {
          try {
            if ($di.Type -eq 1) {
              $name = $di.Properties.Item('Name').Value
              $mfr  = $di.Properties.Item('Manufacturer').Value
              $desc = $di.Properties.Item('Description').Value
              $id   = $di.DeviceID
              $list += [PSCustomObject]@{ Type=$di.Type; Name=$name; Manufacturer=$mfr; Description=$desc; DeviceID=$id }
            }
          } catch {}
        }
        $list | ConvertTo-Json -Compress
      } catch { '[]' }
    `;

    const psPnp = `
      try {
        Get-PnpDevice -Class Image | Where-Object Status -eq 'OK' |
          Select-Object Status, FriendlyName, InstanceId | ConvertTo-Json -Compress
      } catch { '[]' }
    `;

    const psWmi = `
      try {
        Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '(?i)(scan|canon|wsd|imagerunner|mf)' } |
          Select-Object Name, Manufacturer, PNPDeviceID | ConvertTo-Json -Compress
      } catch { '[]' }
    `;

    const [wiaOut, pnpOut, wmiOut] = await Promise.all([
      runPowerShellAsync(psWia, 10000).then(o => o.stdout).catch(() => ''),
      runPowerShellAsync(psPnp, 10000).then(o => o.stdout).catch(() => ''),
      runPowerShellAsync(psWmi, 10000).then(o => o.stdout).catch(() => ''),
    ]);

    const parse = (s) => {
      try { return (s && s.trim() && s.trim() !== 'null') ? JSON.parse(s) : []; } catch { return []; }
    };

    res.json({
      wia: parse(wiaOut),
      pnp: parse(pnpOut),
      wmi: parse(wmiOut),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Routes API

// Config de la machine (plateforme + méthode recommandée) pour la config scanneur
app.get('/api/scanners/config', (req, res) => {
  const platform = os.platform();
  const platformLabels = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
  const recommendedApproach = (platform === 'darwin' || platform === 'linux') ? 'sane' : (platform === 'win32' ? 'system' : 'auto');
  res.json({
    platform,
    platformLabel: platformLabels[platform] || platform,
    recommendedApproach,
    // Mode SANE : sur macOS/Linux, on force SANE pour garantir une prise en charge homogène.
    approaches: (platform === 'darwin' || platform === 'linux')
      ? [{ value: 'sane', label: 'SANE (obligatoire)', forPlatform: 'darwin,linux' }]
      : [
          { value: 'auto', label: 'Auto (toutes les méthodes)', forPlatform: null },
          { value: 'network', label: 'Réseau uniquement', forPlatform: null },
          { value: 'system', label: 'Pilote système (WIA sous Windows)', forPlatform: 'win32' }
        ]
  });
});

// Détecter tous les scanners
// Query: ?prefer_system_driver=1 | ?approach=auto|sane|network|system
app.get('/api/scanners/detect', async (req, res) => {
  try {
    const preferSystemDriver = String(req.query.prefer_system_driver || '').toLowerCase() === '1' || String(req.query.prefer_system_driver || '').toLowerCase() === 'true';
    const requestedApproach = String(req.query.approach || 'auto').toLowerCase();
    let approach = requestedApproach;
    console.log('🔍 Début de la détection des scanners...', approach !== 'auto' ? `(approche: ${approach})` : preferSystemDriver ? '(pilote système WIA/SANE uniquement)' : '');
    const platform = os.platform();

    const useSystemOnly = preferSystemDriver || approach === 'system';

    // Détecter selon la plateforme et l'approche
    let detectionPromises = [];

    // Sur macOS/Linux : SANE en priorité, avec fallback USB sur macOS pour améliorer la détection
    if (platform === 'darwin' || platform === 'linux') {
      approach = 'sane';
      detectionPromises = [scannerInterface.detectSANEScanners()];
      // Optimisation macOS : si SANE n'est pas installé ou ne voit rien, essayer aussi les scanners USB système
      if (platform === 'darwin') {
        detectionPromises.push(scannerInterface.detectUSBScanners());
      }
    } else if (platform === 'win32') {
      if (approach === 'network') {
        detectionPromises = [scannerInterface.detectNetworkScanners()];
      } else if (approach === 'sane') {
        detectionPromises = []; // SANE non disponible sur Windows
      } else if (useSystemOnly) {
        detectionPromises = [scannerInterface.detectTWAINScanners()];
      } else {
        detectionPromises = [
          scannerInterface.detectTWAINScanners(),
          scannerInterface.detectVendorDriverScanners()
        ];
      }
    }
    
    // Utiliser allSettled pour ne pas faire échouer toute la détection si une méthode échoue
    const settled = await Promise.allSettled(detectionPromises);
    const allScanners = [];
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === 'fulfilled' && Array.isArray(s.value)) {
        allScanners.push(...s.value);
      } else if (s.status === 'rejected') {
        console.warn('Détection partielle échouée:', s.reason?.message || s.reason);
      }
    }

    // IPs déjà couvertes par un scanner SANE (éviter doublon réseau pour même IP)
    const saneIPs = new Set(allScanners.filter(s => s.type === 'sane' && s.ipAddress).map(s => s.ipAddress));

    // Déduplication : priorité SANE sur réseau pour une même IP
    const uniqueScanners = [];
    const seen = new Set();
    for (const scanner of allScanners) {
      let key;
      if (scanner.type === 'sane' && scanner.saneDeviceName) {
        key = `sane-${scanner.saneDeviceName}`;
      } else if (scanner.type === 'network') {
        if (saneIPs.has(scanner.ipAddress)) continue;
        key = `network-${scanner.ipAddress}`;
      } else if (scanner.twainDeviceId) {
        key = `twain-${scanner.twainDeviceId}`;
      } else if (scanner.instanceId) {
        key = `vendor-${scanner.instanceId}`;
      } else {
        key = `${scanner.type}-${(scanner.name || scanner.id || '').toString()}`;
      }
      if (!seen.has(key)) {
        seen.add(key);
        uniqueScanners.push(scanner);
      }
    }

    // Vérifier le statut en parallèle (avec timeout par scanner pour ne pas bloquer)
    const statusWithTimeout = (scanner, ms = 4000) =>
      Promise.race([
        scannerInterface.checkScannerStatus(scanner),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
      ]).catch(() => 'offline');
    const statuses = await Promise.all(uniqueScanners.map(s => statusWithTimeout(s)));
    uniqueScanners.forEach((s, i) => { s.status = statuses[i]; });

    // Garantir un nom (et fabricant/modèle) non vides pour l'affichage
    const ensureName = (s) => {
      const name = (s.name && String(s.name).trim()) || (s.model && String(s.model).trim()) || (s.manufacturer && String(s.manufacturer).trim()) || (s.saneDeviceName && scannerInterface._saneDeviceNameToLabel(s.saneDeviceName)) || (s.ipAddress && `Scanner réseau ${s.ipAddress}`) || (s.type === 'network' && s.ipAddress ? `Scanner réseau ${s.ipAddress}` : null) || 'Scanner';
      const manufacturer = (s.manufacturer && String(s.manufacturer).trim()) || (s.type === 'sane' ? 'SANE' : 'Inconnu');
      const model = (s.model && String(s.model).trim()) || name || 'Scanner';
      return { ...s, name, manufacturer, model };
    };
    const normalized = uniqueScanners.map(ensureName);

    console.log(`✅ Détection terminée: ${normalized.length} scanner(s) trouvé(s)`);
    console.log(`   - SANE: ${normalized.filter(s => s.type === 'sane').length}`);
    console.log(`   - Réseau: ${normalized.filter(s => s.type === 'network').length}`);
    console.log(`   - TWAIN: ${normalized.filter(s => s.type === 'twain').length}`);
    console.log(`   - Pilotes fabricant: ${normalized.filter(s => s.type === 'vendor-driver').length}`);
    console.log(`   - USB: ${normalized.filter(s => s.type === 'usb').length}`);
    
    res.json(normalized);
  } catch (error) {
    console.error('Erreur détection scanners:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vérifier le statut d'un scanner
app.post('/api/scanners/:id/status', async (req, res) => {
  try {
    const scanner = req.body;
    const status = await scannerInterface.checkScannerStatus(scanner);
    res.json({ status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scanner un document
app.post('/api/scanners/:id/scan', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, color, duplex, format, scanSource, orientation, pageSize, imageScaleMode } = req.body;
    
    // Récupérer les informations du scanner depuis la requête ou la base de données
    // Pour l'instant, on utilise le body pour passer les infos du scanner
    const scanner = req.body.scanner || {
      id: id,
      type: req.body.scannerType || 'twain'
    };
    
    const effectiveSource = (scanSource || 'vitre').toString().toLowerCase();
    let effectiveOrientation = (orientation != null && orientation !== '' ? String(orientation).trim() : 'auto').toLowerCase();
    if (effectiveOrientation === 'paysage') effectiveOrientation = 'landscape';
    if (effectiveOrientation !== 'portrait' && effectiveOrientation !== 'landscape') effectiveOrientation = 'auto';
    console.log(`📄 Début du scan avec le scanner ${id}...`);
    const effectivePageSize = (pageSize || 'A4').toString();
    console.log(`   Options: resolution=${resolution || 300}, color=${color !== false}, format=${format || 'PDF'}, source=${effectiveSource}, pageSize=${effectivePageSize}, orientation=${effectiveOrientation}, imageScaleMode=${imageScaleMode || 'fill-page'}`);
    if (effectiveSource === 'bac') {
      console.log('   → Mode BAC (chargeur ADF) demandé.');
    }
    
    let scanResult;
    
    // Choisir la méthode de scan selon le type
    // Cas particulier: scanners réseau Canon via pilote constructeur (TWAIN exposé en WIA)
    const isCanon =
      (scanner.manufacturer && scanner.manufacturer.toLowerCase().includes('canon')) ||
      (scanner.name && scanner.name.toLowerCase().includes('canon')) ||
      (scanner.model && scanner.model.toLowerCase().includes('canon'));

    const platform = os.platform();
    const hasNetworkIp = (scanner.type === 'network' && (scanner.ipAddress || scanner.ip));

    if (scanner.type === 'twain' || scanner.twainDeviceId || (scanner.type === 'network' && isCanon)) {
      // Scanner avec TWAIN/WIA (USB ou réseau Canon déjà ajouté dans Windows)
        scanResult = await scannerInterface.scanWithTWAIN(id, scanner, {
          resolution: resolution || 300,
          color: color !== false,
          duplex: duplex || false,
          format: format || 'PDF',
          scanSource: effectiveSource,
          pageSize: effectivePageSize,
          orientation: effectiveOrientation,
          imageScaleMode: imageScaleMode || 'fill-page'
        });
    } else if (scanner.type === 'vendor-driver' || scanner.instanceId) {
      // Scanner avec les pilotes du fabricant (ou WIA sur Windows)
      scanResult = await scannerInterface.scanWithVendorDriver(id, scanner, {
        resolution: resolution || 300,
        color: color !== false,
        duplex: duplex || false,
        format: format || 'PDF',
        scanSource: effectiveSource,
        pageSize: effectivePageSize,
        orientation: effectiveOrientation,
        imageScaleMode: imageScaleMode || 'fill-page'
      });
    } else if (scanner.type === 'sane' && scanner.saneDeviceName && (platform === 'linux' || platform === 'darwin')) {
      // Scanner détecté via SANE (scanimage -L)
      scanResult = await scannerInterface.scanWithVendorDriver(id, scanner, {
        resolution: resolution || 300,
        color: color !== false,
        duplex: duplex || false,
        format: format || 'PDF',
        scanSource: effectiveSource,
        pageSize: effectivePageSize,
        orientation: effectiveOrientation,
        imageScaleMode: imageScaleMode || 'fill-page'
      });
    } else if (hasNetworkIp && platform === 'win32') {
      // Scanner réseau/Wi‑Fi sous Windows : doit être ajouté dans Windows pour être vu par WIA
      res.status(400).json({
        error: 'Sur Windows, les scanners réseau/Wi‑Fi doivent être ajoutés dans Paramètres > Périphériques > Imprimantes et scanners pour être utilisés via WIA (sans pilote fabricant). Ajoutez le scanner puis rafraîchissez la liste.',
        code: 'WINDOWS_NETWORK_SCANNER_ADD_DEVICE'
      });
      return;
    } else if (hasNetworkIp && (platform === 'linux' || platform === 'darwin')) {
      // Scanner réseau/Wi‑Fi sous Linux/macOS : SANE backend "net" (sans pilote fabricant)
      scanResult = await scannerInterface.scanWithSANENetwork(id, scanner, {
        resolution: resolution || 300,
        color: color !== false,
        duplex: duplex || false,
        format: format || 'PDF'
      });
    } else {
      throw new Error(`Type de scanner non supporté pour le scan: ${scanner.type}. ` +
        `Pour les scanners réseau Canon sous Windows, ajoutez le scanner dans Paramètres > Périphériques. ` +
        `Pour Linux/macOS, utilisez SANE (backend net) avec l’adresse IP du scanner.`);
    }
    
    console.log(`✅ Scan terminé: ${scanResult.fileName}`);
    
    // Retourner le fichier scanné
    res.setHeader('Content-Type', scanResult.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${scanResult.fileName}"`);
    res.setHeader('X-Scanner-Id', id);
    res.setHeader('X-File-Name', scanResult.fileName);
    res.send(scanResult.buffer);
    
  } catch (error) {
    console.error('❌ Erreur lors du scan:', error);
    const raw = error?.message || String(error);
    const platform = os.platform();
    // Message selon la plateforme : SANE sur Mac/Linux, WIA sur Windows
    const scanTroubleshootByPlatform = {
      darwin: 'Le scan a échoué. À vérifier : 1) Scanner branché et allumé ; 2) SANE installé (brew install sane-backends) ; 3) Scanner reconnu par SANE (scanimage -L dans le terminal). Bac (chargeur) : feuilles en place et chargeur fermé.',
      linux: 'Le scan a échoué. À vérifier : 1) Scanner branché et allumé ; 2) sane-backends installé ; 3) Scanner reconnu (scanimage -L). Bac (chargeur) : feuilles en place et chargeur fermé.',
      win32: 'Le scan a échoué. À vérifier : 1) Scanner branché et allumé ; 2) Scanner visible dans Windows (Paramètres > Périphériques > Imprimantes et scanners) ; 3) Pilotes WIA (souvent inclus avec Windows, sinon pilote fabricant). Bac (chargeur) : feuilles en place et chargeur fermé.'
    };
    const defaultTroubleshoot = scanTroubleshootByPlatform[platform] || scanTroubleshootByPlatform.darwin;
    const isTechnical = /command failed|powershell|scan-detect-|AppData[\\/]Local[\\/]Temp|EPERM|ETIMEDOUT|scanimage|sane/i.test(raw);
    const userError = isTechnical ? defaultTroubleshoot : raw;
    res.status(500).json({
      error: userError,
      platform,
      details: 'Voir aussi : serveur de scan démarré (port 3001), URL correcte dans Paramètres > Scanners.'
    });
  }
});

// Obtenir les liens de téléchargement des pilotes pour un scanner
app.get('/api/scanners/:id/driver-links', async (req, res) => {
  try {
    const { id } = req.params;
    const { manufacturer, model } = req.query;
    
    if (!manufacturer && !model) {
      return res.status(400).json({ 
        error: 'Manufacturer ou model requis' 
      });
    }
    
    const driverLinks = getDriverDownloadLinks(manufacturer, model);
    const directLink = getDirectDriverLink(manufacturer, model);
    
    if (directLink) {
      driverLinks.links.unshift({
        type: 'Lien direct',
        url: directLink,
        description: `Lien direct vers les pilotes ${manufacturer} ${model}`,
        priority: true
      });
    }
    
    res.json(driverLinks);
  } catch (error) {
    console.error('Erreur génération liens pilotes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur backend démarré sur http://localhost:${PORT}`);
  console.log(`📡 API disponible sur http://localhost:${PORT}/api`);
});

