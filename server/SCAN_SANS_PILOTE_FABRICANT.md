# Scanner sans pilote fabricant (WIA / SANE)

Oui, il est possible de faire fonctionner un scanner dans l’application **sans installer les pilotes du fabricant**, en utilisant les APIs système suivantes. Cela inclut les **scanners Wi‑Fi / réseau** : même principe, selon l’OS.

## Scanners Wi‑Fi / réseau

- **Windows :** Un scanner connecté en Wi‑Fi peut être utilisé **sans pilote fabricant** si Windows le reconnaît. Ajoutez-le via **Paramètres > Périphériques > Imprimantes et scanners > Ajouter un périphérique** (ou il peut apparaître en WSD). Une fois listé dans « Périphériques et imprimantes », il est accessible via **WIA** ; l’application le détecte comme les autres scanners.
- **Linux / macOS :** Vous pouvez **ajouter un scanner par adresse IP** dans l’app (Paramètres > Scanners > Ajouter un scanner). Avec **SANE** et le backend « net », de nombreux scanners réseau sont supportés sans pilote fabricant ; configurez SANE pour votre modèle (voir doc SANE) puis détectez ou ajoutez le scanner par IP.

---

## Windows : WIA (Windows Image Acquisition)

**WIA** est une API Microsoft intégrée à Windows. Elle permet de détecter et d’utiliser les scanners (USB ou **Wi‑Fi / réseau**) via le **pilote générique Windows**, sans installer le pilote TWAIN du fabricant.

### Ce que fait déjà l’application

- Le serveur de scan (`server/server.js`) utilise **WIA** pour la détection et le scan sur Windows (PowerShell `WIA.DeviceManager`).
- Les scanners qui apparaissent dans **« Périphériques et imprimantes »** ou **« Scanner et appareil photo Windows »** sont en général accessibles via WIA (y compris scanners Wi‑Fi ajoutés à Windows).
- Si Windows reconnaît votre scanner (pilote Windows générique ou pilote fourni par Windows Update), vous n’avez **pas besoin** d’installer le pilote TWAIN du fabricant.

### Configuration côté Windows (USB ou Wi‑Fi)

1. Connectez le scanner (USB ou Wi‑Fi sur le même réseau).
2. Pour un **scanner Wi‑Fi** : **Paramètres > Périphériques > Imprimantes et scanners > Ajouter un périphérique** (ou laissez Windows le découvrir en WSD). Laissez Windows installer le pilote (générique ou Windows Update).
3. Vérifiez dans **Périphériques et imprimantes** (ou **Scanner et appareil photo Windows**) que le scanner est listé.
4. Optionnel : testez un scan dans « Scanner et appareil photo Windows » pour confirmer que WIA fonctionne.
5. Dans l’application : **Paramètres > Scanners** : configurez l’URL du serveur de scan (ex. `http://localhost:3001`), puis **Rafraîchir** ou **Ajouter un scanner**.

### Si le scanner n’apparaît pas en WIA

- Certains modèles (surtout Wi‑Fi) ne sont reconnus par Windows qu’avec le pilote du fabricant. Dans ce cas, installez uniquement le pilote **WIA** ou **TWAIN** fourni par le fabricant (souvent proposé comme « pilote de scan » ou « ScanGear »).
- L’application utilise WIA en priorité ; une fois le pilote installé, le scanner peut apparaître comme périphérique WIA et être utilisé sans configuration supplémentaire dans l’app.

---

## Linux : SANE (Scanner Access Now Easy)

**SANE** est une API open source pour les scanners. De nombreux scanners fonctionnent avec SANE **sans pilote fabricant**.

### Installation

```bash
# Ubuntu / Debian
sudo apt-get install sane sane-utils libsane-dev

# Fedora / RHEL
sudo dnf install sane-backends sane-backends-devel
```

### Vérification

```bash
scanimage -L
```

Si votre scanner apparaît dans la liste, il peut être utilisé par l’application (serveur de scan sur Linux avec `scanimage`).

### Scanners Wi‑Fi / réseau sous Linux

- SANE peut piloter des scanners **réseau** (backend `net`). Le serveur de scan du projet utilise `scanimage --device-name "net:IP"` pour scanner via le réseau sans pilote fabricant.
- Après installation de SANE (`sane-backends`), utilisez **Paramètres > Scanners > Ajouter un scanner** et renseignez l’adresse IP du scanner Wi‑Fi.
- Démarrez le serveur de scan sur une machine Linux du même réseau ; indiquez son URL dans l’app, puis ajoutez le scanner par IP. Le scan sera effectué via SANE (backend `net`).

---

## macOS : SANE ou outils système

Sur Mac, vous pouvez utiliser **SANE** (via Homebrew) pour éviter le pilote fabricant :

```bash
brew install sane-backends
scanimage -L
```

Le serveur de scan du projet utilise aussi les outils système (USB, etc.) pour la détection. Si `scanimage` voit le scanner, le scan peut se faire via SANE sans pilote fabricant.

---

## Résumé

| Système   | API utilisée     | USB | Wi‑Fi / réseau | Pilote fabricant ? |
|-----------|------------------|-----|----------------|---------------------|
| Windows   | **WIA** (intégré)| Oui | Oui (ajouter le scanner dans Windows) | Souvent **non** (pilote Windows suffit) |
| Linux     | **SANE**         | Oui | Oui (ajout par IP, backend `net`)     | Souvent **non** (open source) |
| macOS     | **SANE** / système | Oui | Oui (ajout par IP si SANE le supporte) | Souvent **non** si SANE installé |

La prise en charge et la configuration du scanner dans l’application (y compris **scanner Wi‑Fi**) se font donc **sans obligatoirement passer par les pilotes du fabricant** : sous Windows via WIA (après ajout du scanner dans Windows), sous Linux/macOS via SANE (y compris backend `net` pour le scan réseau par IP), avec le serveur de scan déjà fourni dans le projet.

### Option « Privilégier pilote système (WIA/SANE) »

Dans **Paramètres > Scanners**, l’option **« Privilégier pilote système (WIA/SANE) sans pilote fabricant »** fait en sorte que, sous Windows, seuls les scanners détectés via **WIA** sont listés (les pilotes fabricant du Gestionnaire de périphériques sont ignorés). Sous Linux/macOS, la détection reste inchangée (réseau + USB/SANE). Cette préférence est sauvegardée et utilisée automatiquement pour la détection et le rafraîchissement des scanners.
