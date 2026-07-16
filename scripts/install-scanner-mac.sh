#!/bin/bash

# Script d'installation pour le scan Canon imageRUNNER sur macOS
# Ce script configure automatiquement l'environnement de scan

set -e

echo "🔧 Installation du système de scan Canon pour GestionCourrier"
echo "=============================================================="

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Vérifier macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "Ce script est uniquement pour macOS"
    exit 1
fi

print_status "Système d'exploitation : macOS $(sw_vers -productVersion)"

# Vérifier Xcode Command Line Tools
if ! command -v xcrun &> /dev/null; then
    print_warning "Xcode Command Line Tools non détecté"
    echo "Installation en cours..."
    xcode-select --install
    echo "⏳ Veuillez compléter l'installation dans la fenêtre qui s'ouvre, puis relancez ce script"
    exit 1
fi

print_status "Xcode Command Line Tools installé"

# Vérifier Swift
if ! command -v swift &> /dev/null; then
    print_error "Swift n'est pas installé"
    echo "Veuillez installer Xcode ou Xcode Command Line Tools"
    exit 1
fi

print_status "Swift disponible : $(swift --version | head -n1)"

# Compiler l'outil ICA
echo ""
echo "🔨 Compilation de l'outil ICA (Image Capture)..."
echo "------------------------------------------------"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ICA_DIR="$PROJECT_ROOT/tools/mac-ica-scan"

if [ ! -d "$ICA_DIR" ]; then
    print_error "Répertoire ICA non trouvé : $ICA_DIR"
    exit 1
fi

cd "$ICA_DIR"

# Vérifier si déjà compilé
if [ -f "./mac-ica-scan" ]; then
    print_warning "L'outil ICA est déjà compilé"
    read -p "Voulez-vous recompiler ? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_status "Compilation sautée"
    else
        compile_ica=true
    fi
else
    compile_ica=true
fi

if [ "$compile_ica" = true ]; then
    echo "Compilation de MacICAScan.swift..."
    if swiftc -o mac-ica-scan MacICAScan.swift -framework ImageCaptureCore 2>&1; then
        chmod +x mac-ica-scan
        print_status "Outil ICA compilé avec succès"
    else
        print_error "Échec de la compilation ICA"
        echo "Assurez-vous que ImageCaptureCore.framework est disponible"
        exit 1
    fi
fi

# Tester l'outil ICA
echo ""
echo "🧪 Test de l'outil ICA..."
echo "-------------------------"

if [ -f "./mac-ica-scan" ]; then
    # Test simple
    timeout 5 ./mac-ica-scan list 2>/dev/null || true
    print_status "Outil ICA fonctionnel"
else
    print_error "Outil ICA introuvable après compilation"
    exit 1
fi

# Vérifier SANE (optionnel)
echo ""
echo "🔍 Vérification de SANE (optionnel)..."
echo "---------------------------------------"

if command -v scanimage &> /dev/null; then
    print_status "SANE (scanimage) disponible"
    echo "Version : $(scanimage --version 2>&1 | head -n1)"
    
    # Tester la détection
    echo ""
    echo "Test de détection des scanners..."
    scanimage -L 2>/dev/null || print_warning "Aucun scanner détecté par SANE"
else
    print_warning "SANE (scanimage) non installé"
    echo ""
    echo "Pour installer SANE :"
    echo "  brew install sane-backends"
    echo ""
    read -p "Installer SANE maintenant ? (o/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        if command -v brew &> /dev/null; then
            echo "Installation de SANE via Homebrew..."
            brew install sane-backends
            print_status "SANE installé"
        else
            print_error "Homebrew non installé"
            echo "Veuillez installer Homebrew d'abord : https://brew.sh"
        fi
    fi
fi

# Configuration du scanner Canon
echo ""
echo "🖨️  Configuration du scanner Canon"
echo "-----------------------------------"

echo "Pour configurer votre Canon imageRUNNER 2206N :"
echo ""
echo "1. Vérifiez l'adresse IP du scanner :"
echo "   - Sur l'écran du scanner : Menu → Réglages → Réseau → TCP/IP"
echo ""
echo "2. Testez la connexion réseau :"
echo "   ping <IP_DU_SCANNER>"
echo ""
echo "3. Si le scanner n'est pas détecté automatiquement :"
echo "   - Allez dans Paramètres → Gestion des scanners"
echo "   - Cliquez sur 'Ajouter manuellement'"
echo "   - Entrez l'IP du scanner"
echo ""

# Vérifier la connexion réseau (optionnel)
read -p "Voulez-vous tester la connexion à un scanner maintenant ? (o/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Oo]$ ]]; then
    read -p "Entrez l'adresse IP du scanner (ex: 192.168.1.100) : " scanner_ip
    
    if [ -n "$scanner_ip" ]; then
        echo "Test de connexion à $scanner_ip..."
        
        if ping -c 1 -W 2 "$scanner_ip" &> /dev/null; then
            print_status "Scanner accessible (ping OK)"
            
            # Test port IPP
            if nc -z -G 2 "$scanner_ip" 631 2>/dev/null || nc -z -w 2 "$scanner_ip" 631 2>/dev/null; then
                print_status "Port IPP (631) ouvert"
            fi
            
            # Test port HTTP
            if nc -z -G 2 "$scanner_ip" 80 2>/dev/null || nc -z -w 2 "$scanner_ip" 80 2>/dev/null; then
                print_status "Port HTTP (80) ouvert"
            fi
        else
            print_error "Scanner inaccessible (ping échoué)"
            echo "Vérifiez :"
            echo "  - Le scanner est allumé"
            echo "  - L'adresse IP est correcte"
            echo "  - Vous êtes sur le même réseau"
        fi
    fi
fi

# Résumé
echo ""
echo "=============================================================="
echo "✅ Installation terminée !"
echo "=============================================================="
echo ""
echo "Résumé :"
echo "--------"

if [ -f "$ICA_DIR/mac-ica-scan" ]; then
    print_status "Outil ICA compilé et prêt"
else
    print_error "Outil ICA - problème de compilation"
fi

if command -v scanimage &> /dev/null; then
    print_status "SANE (scanimage) disponible"
else
    print_warning "SANE non installé (optionnel)"
fi

echo ""
echo "Prochaines étapes :"
echo "-----------------"
echo "1. Lancez l'application GestionCourrier"
echo "2. Allez dans Paramètres → Gestion des scanners"
echo "3. Cliquez sur 'Détecter les scanners'"
echo "4. Votre Canon imageRUNNER devrait apparaître"
echo ""
echo "Documentation complète :"
echo "  docs/CANON_IMAGERUNNER_MAC_SETUP.md"
echo ""
echo "Support :"
echo "--------"
echo "En cas de problème, vérifiez :"
echo "  - La documentation dans docs/"
echo "  - Les logs dans la console navigateur (F12)"
echo "  - Que le scanner est bien configuré en réseau"
echo ""

print_status "Installation terminée avec succès !"
