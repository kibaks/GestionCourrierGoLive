# Liens Directs pour Télécharger TWAIN

## ⚠️ Important : Clarification

**TWAIN n'est pas un logiciel séparé à télécharger.** C'est un standard intégré dans les pilotes de votre scanner.

Cependant, si vous cherchez le **TWAIN Data Source Manager (DSM)** pour le développement, voici les liens :

## Liens Officiels TWAIN

### Site Officiel TWAIN Working Group
- **URL principale** : https://www.twain.org/
- **Page de téléchargements** : https://www.twain.org/downloads/
- **Documentation** : https://www.twain.org/docs/

### Téléchargements Directs (selon la plateforme)

#### Windows
- **TWAIN DSM 2.5 pour Windows (64-bit)**
  - Disponible sur : https://www.twain.org/downloads/
  - Recherchez "TWAIN Data Source Manager 2.5 Windows"
  - **Note** : Windows 10/11 inclut déjà WIA (Windows Image Acquisition) qui supporte TWAIN

#### macOS
- **TWAIN DSM pour macOS**
  - Disponible sur : https://www.twain.org/downloads/
  - Ou utilisez **SANE** (recommandé) : `brew install sane-backends`

#### Linux
- **SANE** (Scanner Access Now Easy) - Alternative TWAIN
  - Ubuntu/Debian : `sudo apt-get install sane sane-utils libsane-dev`
  - Fedora/RHEL : `sudo dnf install sane-backends sane-backends-devel`

## Pour les Utilisateurs (Recommandé)

**Vous n'avez PAS besoin de télécharger TWAIN !**

Téléchargez simplement les **pilotes de votre scanner** depuis le site du fabricant :

### Liens Directs par Fabricant

#### Canon
- **Site support** : https://www.canon.fr/support
- **Recherche pilotes** : https://www.canon.fr/support?q=ScanGear
- **Pilotes TWAIN Canon** : Disponibles dans la section "Logiciels et pilotes" de chaque modèle

#### HP
- **Site support** : https://support.hp.com
- **Pilotes scanners** : https://support.hp.com/drivers/scanners
- **Recherche par modèle** : https://support.hp.com/drivers

#### Epson
- **Site support** : https://www.epson.fr/support
- **Epson Scan** : https://www.epson.fr/support/downloads
- **Pilotes TWAIN** : Inclus dans Epson Scan

#### Brother
- **Site support** : https://www.brother.fr/support
- **Téléchargements** : https://www.brother.fr/support/downloads
- **Pilotes TWAIN** : Disponibles pour chaque modèle

## Pour notre Application

**Vous n'avez rien à télécharger !**

Notre application utilise :
- **Windows** : WIA (déjà inclus dans Windows) ✅
- **macOS/Linux** : SANE (optionnel, si vous voulez un support avancé)

**Il suffit d'installer les pilotes de votre scanner** depuis le site du fabricant.

## Résumé Rapide

| Besoin | Lien | Description |
|--------|------|-------------|
| **Utiliser un scanner** | Site du fabricant | Télécharger les pilotes du scanner |
| **Développer avec TWAIN** | https://www.twain.org/downloads/ | SDK TWAIN DSM |
| **Support Windows** | Déjà inclus | WIA est dans Windows |
| **Support macOS/Linux** | `brew install sane-backends` | Installer SANE |

## Exemple : Scanner Canon

1. Allez sur : **https://www.canon.fr/support**
2. Recherchez votre modèle (ex: "imageFORMULA P-215II")
3. Téléchargez **"ScanGear"** ou **"Pilotes TWAIN"**
4. Installez les pilotes
5. ✅ Votre scanner est maintenant compatible TWAIN !

## Contact TWAIN Working Group

- **Site web** : https://www.twain.org/
- **Email** : info@twain.org
- **Forum** : Disponible sur le site twain.org

---

**En résumé** : Pour utiliser un scanner avec notre application, téléchargez les pilotes depuis le site du fabricant, pas TWAIN lui-même. TWAIN est inclus dans ces pilotes.

