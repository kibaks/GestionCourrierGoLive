#!/bin/bash
# Script pour installer Homebrew sur macOS et l'ajouter au PATH
# À exécuter dans le Terminal : bash scripts/install-homebrew.sh

set -e

echo "=== Installation de Homebrew ==="
echo ""

# 1. Installer Homebrew (demandera votre mot de passe)
if command -v brew &>/dev/null; then
  echo "Homebrew est déjà installé : $(brew --version)"
else
  echo "Téléchargement et installation de Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo ""

# 2. Ajouter Homebrew au PATH pour qu'il soit reconnu partout
BREW_PREFIX=""
if [[ -x /opt/homebrew/bin/brew ]]; then
  BREW_PREFIX="/opt/homebrew"
elif [[ -x /usr/local/bin/brew ]]; then
  BREW_PREFIX="/usr/local"
fi

if [[ -n "$BREW_PREFIX" ]]; then
  SHELL_RC=""
  if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_RC="$HOME/.zprofile"
  else
    SHELL_RC="$HOME/.bash_profile"
  fi

  LINE='eval "$('"$BREW_PREFIX"'/bin/brew shellenv)"'
  if ! grep -q "brew shellenv" "$SHELL_RC" 2>/dev/null; then
    echo "Ajout de Homebrew au PATH dans $SHELL_RC"
    echo "$LINE" >> "$SHELL_RC"
  fi

  eval "$($BREW_PREFIX/bin/brew shellenv)"
  echo "Homebrew est maintenant dans le PATH."
  echo ""
  echo "Vérification : $(brew --version)"
  echo ""
  echo "Fermez et rouvrez le Terminal pour que 'brew' soit reconnu partout."
  echo "Ensuite vous pourrez installer SANE : brew install sane-backends"
else
  echo "Homebrew n'a pas été trouvé après l'installation. Vérifiez les messages ci-dessus."
  exit 1
fi
