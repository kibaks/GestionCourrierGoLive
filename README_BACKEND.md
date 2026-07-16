# Guide de démarrage - Backend de détection de scanners

## Installation et démarrage

### 1. Installer les dépendances du backend

```bash
cd server
npm install
```

### 2. Démarrer le serveur backend

```bash
cd server
npm run dev
```

Le serveur backend sera accessible sur `http://localhost:3001`

### 3. Démarrer le frontend (dans un autre terminal)

```bash
npm run dev
```

Le frontend sera accessible sur `http://localhost:5173`

## Configuration

Le frontend est configuré pour se connecter au backend sur `http://localhost:3001` par défaut.

Pour changer l'URL du backend, créez un fichier `.env` à la racine du projet :

```
VITE_API_URL=http://localhost:3001
```

## Fonctionnalités de détection

Le backend détecte les scanners de plusieurs façons :

1. **Scanners USB** : Utilise `system_profiler` et `ioreg` pour détecter les scanners USB connectés à macOS
2. **Scanners réseau** : Scanne le réseau local pour trouver les périphériques avec des ports de scanner ouverts (80, 443, 9100, 515, 631)

## Notes

- Le scan réseau peut prendre quelques secondes
- Les scanners USB sont détectés en temps réel
- Si aucun scanner n'est détecté, vérifiez que vos scanners sont bien connectés et allumés

