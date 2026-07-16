# Backend API - Détection de Scanners

Ce serveur backend Node.js permet la détection réelle des scanners connectés à votre système macOS.

## Installation

```bash
cd server
npm install
```

## Démarrage

```bash
npm run dev
```

Le serveur sera accessible sur `http://localhost:3001`

## Fonctionnalités

### Détection des scanners

Le backend utilise plusieurs méthodes pour détecter les scanners :

1. **Scanners USB** : Via `system_profiler` et `ioreg` pour détecter les scanners USB connectés
2. **Scanners réseau** : Scan du réseau local pour détecter les périphériques réseau avec des ports de scanner ouverts

### API Endpoints

- `GET /api/scanners/detect` - Détecter tous les scanners disponibles
- `POST /api/scanners/:id/status` - Vérifier le statut d'un scanner
- `POST /api/scanners/:id/scan` - Initier un scan (à implémenter avec TWAIN/SANE)
- `GET /api/health` - Vérifier l'état du serveur

## Notes importantes

- Le scan réseau peut prendre quelques secondes car il teste plusieurs adresses IP
- Les scanners USB sont détectés via les commandes système macOS
- Pour une détection plus avancée, vous pouvez installer SANE (Scanner Access Now Easy) et utiliser `node-sane`

## Installation de SANE (optionnel)

Pour une meilleure détection et support de scan, installez SANE :

```bash
brew install sane-backends
```

Ensuite, installez la bibliothèque Node.js :

```bash
npm install sane
```

