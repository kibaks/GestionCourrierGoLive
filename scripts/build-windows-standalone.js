#!/usr/bin/env node
/**
 * Build script for the Windows standalone scan server.
 *
 * This script prepares all files needed to create a single .exe Windows service.
 * The actual .exe creation must run on Windows (or via GitHub Actions) because
 * Node.js Single Executable Applications (SEA) must be built with a Windows Node binary.
 *
 * Output: dist/windows/
 *   - server.cjs              : bundled server code (CommonJS)
 *   - sea-config.json         : Node SEA configuration
 *   - config.json             : runtime configuration template
 *   - GestionCourrierScan.xml : Windows Service Wrapper (winsw) configuration
 *   - install.ps1             : installs the service
 *   - uninstall.ps1           : removes the service
 *   - build-exe.bat           : run on Windows to create the .exe with Node SEA
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist', 'windows');
const workflowDir = path.join(rootDir, '.github', 'workflows');

function mkdir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function write(p, content) {
  fs.writeFileSync(p, content, 'utf8');
  console.log(`  wrote ${path.relative(rootDir, p)}`);
}

async function bundleServer() {
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    console.error('\nError: esbuild is required to bundle the server.');
    console.error('Install it with: npm install --save-dev esbuild');
    process.exit(1);
  }
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'server', 'server.js')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.join(outDir, 'server.cjs'),
    nodePaths: [path.join(rootDir, 'server', 'node_modules')],
    define: {
      'import.meta.url': '"file:///GestionCourrierScan/server.js"',
    },
    banner: {
      js: `/* GestionCourrier Scan Server - bundled ${new Date().toISOString()} */`,
    },
  });
}

function generateFiles() {
  // Node SEA configuration
  const seaConfig = {
    main: 'server.cjs',
    output: 'sea-prep.blob',
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
  };
  write(path.join(outDir, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));

  // Runtime configuration template
  const config = {
    port: 3001,
  };
  write(path.join(outDir, 'config.json'), JSON.stringify(config, null, 2));

  // winsw service configuration
  const serviceName = 'GestionCourrierScan';
  const winswXml = `<?xml version="1.0" encoding="utf-8"?>
<service>
  <id>${serviceName}</id>
  <name>Gestion Courrier Scan Server</name>
  <description>Serveur local de scan pour Gestion Courrier (WIA/TWAIN)</description>
  <executable>%BASE%\\GestionCourrierScan.exe</executable>
  <arguments></arguments>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <filesToKeep>5</filesToKeep>
  </log>
  <logpath>%BASE%\\logs</logpath>
  <workingdirectory>%BASE%</workingdirectory>
  <onfailure action="restart" delay="10 sec"/>
  <startmode>Automatic</startmode>
</service>
`;
  write(path.join(outDir, 'GestionCourrierScan.xml'), winswXml);

  // Install script
  const installPs1 = `#Requires -RunAsAdministrator
<#
  Installe le serveur de scan Gestion Courrier comme service Windows.
  À exécuter en tant qu'administrateur dans le dossier dist/windows.
#>
$ErrorActionPreference = "Stop"
$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ServiceName = "GestionCourrierScan"
$ExeName = "GestionCourrierScan.exe"
$XmlName = "GestionCourrierScan.xml"

if (-not (Test-Path (Join-Path $BaseDir $ExeName))) {
  Write-Error "Exécutable introuvable : $ExeName. Lancez d'abord build-exe.bat sur cette machine."
}
if (-not (Test-Path (Join-Path $BaseDir $XmlName))) {
  Write-Error "Configuration winsw introuvable : $XmlName"
}

# Créer le dossier d'installation stable
$InstallDir = "C:\\Program Files\\GestionCourrierScan"
if (-not (Test-Path $InstallDir)) {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Copier les fichiers nécessaires
Copy-Item -Path "$BaseDir\\$ExeName" -Destination $InstallDir -Force
Copy-Item -Path "$BaseDir\\$XmlName" -Destination $InstallDir -Force
Copy-Item -Path "$BaseDir\\config.json" -Destination $InstallDir -Force
if (Test-Path "$BaseDir\\winsw.exe") {
  Copy-Item -Path "$BaseDir\\winsw.exe" -Destination $InstallDir -Force
} else {
  # Télécharger winsw s'il n'est pas fourni
  $WinswUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"
  Invoke-WebRequest -Uri $WinswUrl -OutFile "$InstallDir\\winsw.exe" -UseBasicParsing
}

# Créer le dossier de logs
if (-not (Test-Path "$InstallDir\\logs")) {
  New-Item -ItemType Directory -Path "$InstallDir\\logs" -Force | Out-Null
}

# Installer et démarrer le service
Set-Location $InstallDir
.\\winsw.exe install $XmlName
.\\winsw.exe start $XmlName

# Ouvrir le port 3001 dans le pare-feu Windows
$FwRule = "GestionCourrierScan"
$existing = Get-NetFirewallRule -DisplayName $FwRule -ErrorAction SilentlyContinue
if (-not $existing) {
  New-NetFirewallRule -DisplayName $FwRule -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow | Out-Null
}

Write-Host "Service $ServiceName installé et démarré."
Write-Host "Dossier : $InstallDir"
Write-Host "Port    : 3001"
`;
  write(path.join(outDir, 'install.ps1'), installPs1);

  // Uninstall script
  const uninstallPs1 = `#Requires -RunAsAdministrator
<#
  Désinstalle le service GestionCourrierScan.
#>
$ErrorActionPreference = "Stop"
$InstallDir = "C:\\Program Files\\GestionCourrierScan"
$ServiceName = "GestionCourrierScan"

if (Test-Path $InstallDir) {
  Set-Location $InstallDir
  if (Test-Path "winsw.exe") {
    .\\winsw.exe stop GestionCourrierScan.xml -ErrorAction SilentlyContinue
    .\\winsw.exe uninstall GestionCourrierScan.xml -ErrorAction SilentlyContinue
  }
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName | Out-Null
}

Remove-NetFirewallRule -DisplayName $ServiceName -ErrorAction SilentlyContinue

Write-Host "Service $ServiceName désinstallé."
`;
  write(path.join(outDir, 'uninstall.ps1'), uninstallPs1);

  // Batch to create the .exe on Windows
  const buildExeBat = `@echo off
REM Run this batch on Windows after installing Node.js to create GestionCourrierScan.exe
REM It uses Node.js Single Executable Applications (SEA) and postject.

setlocal enabledelayedexpansion

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to build the executable. Install it from https://nodejs.org/
  exit /b 1
)

echo Creating SEA blob...
node --experimental-sea-config sea-config.json
if errorlevel 1 (
  echo Failed to create SEA blob
  exit /b 1
)

echo Copying Node.exe...
for /f "delims=" %%%%a in ('where node') do set NODE_EXE=%%%%a
copy "%%NODE_EXE%%" GestionCourrierScan.exe >nul

echo Injecting blob into executable...
npx postject GestionCourrierScan.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b283df2692 --macho-segment-name NODE_SEA
if errorlevel 1 (
  echo Failed to inject SEA blob
  exit /b 1
)

echo.
echo GestionCourrierScan.exe created successfully.
echo Run install.ps1 as Administrator to install the Windows service.
pause
`;
  write(path.join(outDir, 'build-exe.bat'), buildExeBat);

  // README for dist folder
  const readme = `# Gestion Courrier - Scan Server (Windows standalone)

Fichiers générés :
- **server.cjs** : serveur Express bundlé
- **GestionCourrierScan.xml** : configuration du service Windows (winsw)
- **config.json** : port du serveur (défaut 3001)
- **install.ps1** : installe le service
- **uninstall.ps1** : supprime le service
- **build-exe.bat** : crée le .exe (à lancer sur Windows avec Node.js installé)

## Pour créer le .exe

Sur une machine Windows avec Node.js 20+ :
\`\`\`
cd dist\\windows
build-exe.bat
\`\`\`

## Pour installer le service

1. Copier le dossier \`dist\\windows\` sur le poste client Windows.
2. Double-cliquer sur \`install.ps1\` (en tant qu'administrateur).

Le service démarre automatiquement et écoute sur le port configuré dans \`config.json\`.

## Configuration

Modifier \`config.json\` avant l'installation :
\`\`\`json
{
  "port": 3001
}
\`\`\`
`;
  write(path.join(outDir, 'README.md'), readme);
}

function generateGitHubWorkflow() {
  const workflow = `name: Build Windows Scan Server

on:
  push:
    branches: [main]
    paths:
      - 'server/**'
      - 'scripts/build-windows-standalone.js'
      - '.github/workflows/build-scan-server.yml'
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install esbuild
        run: npm install --save-dev esbuild

      - name: Prepare standalone files
        run: node scripts/build-windows-standalone.js

      - name: Build executable
        shell: cmd
        run: |
          cd dist\windows
          node --experimental-sea-config sea-config.json
          copy "%PROGRAMFILES%\\nodejs\\node.exe" GestionCourrierScan.exe
          npx postject GestionCourrierScan.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b283df2692 --macho-segment-name NODE_SEA

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: gestion-courrier-scan-server-windows
          path: |
            dist/windows/GestionCourrierScan.exe
            dist/windows/config.json
            dist/windows/GestionCourrierScan.xml
            dist/windows/install.ps1
            dist/windows/uninstall.ps1
`;
  mkdir(workflowDir);
  write(path.join(workflowDir, 'build-scan-server.yml'), workflow);
}

async function main() {
  console.log('Preparing Windows standalone scan server files...\n');
  mkdir(outDir);

  console.log('Bundling server.js with esbuild...');
  await bundleServer();

  console.log('\nGenerating service files...');
  generateFiles();

  console.log('\nGenerating GitHub Actions workflow...');
  generateGitHubWorkflow();

  console.log('\nDone.');
  console.log('Run this script on macOS/Linux to prepare files, then run build-exe.bat on Windows.');
  console.log('Or push to GitHub and use the workflow .github/workflows/build-scan-server.yml');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
