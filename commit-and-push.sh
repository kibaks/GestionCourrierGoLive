#!/bin/bash
# Script bash pour commit et push automatique
# Usage: ./commit-and-push.sh "Message du commit"

MESSAGE="${1:-Auto-commit: $(date '+%Y-%m-%d %H:%M:%S')}"

echo "🔄 Vérification de l'état du dépôt..."

# Vérifier si on est dans un dépôt Git
if [ ! -d .git ]; then
    echo "❌ Erreur: Ce répertoire n'est pas un dépôt Git!"
    exit 1
fi

# Afficher l'état
git status --short

# Vérifier s'il y a des modifications
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ Aucune modification à committer."
    
    # Vérifier s'il y a des commits non poussés
    git fetch origin --quiet
    LOCAL_COMMITS=$(git log origin/main..HEAD --oneline)
    if [ -n "$LOCAL_COMMITS" ]; then
        echo "📤 Des commits locaux doivent être poussés..."
        echo "Commits à pousser:"
        echo "$LOCAL_COMMITS"
        echo ""
        echo "🚀 Poussage vers origin/main..."
        MAX_RETRIES=3
        RETRY_COUNT=0
        PUSH_SUCCESS=0
        
        while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ $PUSH_SUCCESS -eq 0 ]; do
            if [ $RETRY_COUNT -gt 0 ]; then
                echo "🔄 Nouvelle tentative ($RETRY_COUNT/$MAX_RETRIES)..."
                sleep 2
            fi
            
            git push origin main
            if [ $? -eq 0 ]; then
                PUSH_SUCCESS=1
                echo "✅ Push réussi!"
            else
                RETRY_COUNT=$((RETRY_COUNT + 1))
                if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                    echo "⚠️ Échec du push, nouvelle tentative dans 2 secondes..."
                else
                    echo "❌ Erreur lors du push après $MAX_RETRIES tentatives!"
                    echo "💡 Vérifiez votre connexion et essayez manuellement: git push origin main"
                    exit 1
                fi
            fi
        done
    else
        echo "✅ Tout est à jour, rien à pousser."
    fi
    exit 0
fi

# Ajouter tous les fichiers modifiés
echo ""
echo "📦 Ajout des fichiers modifiés..."
git add -A

# Vérifier ce qui a été ajouté
STAGED=$(git diff --cached --name-only)
if [ -n "$STAGED" ]; then
    echo "Fichiers à committer:"
    echo "$STAGED" | while read file; do
        echo "  - $file"
    done
    
    # Créer le commit
    echo ""
    echo "💾 Création du commit..."
    echo "Message: $MESSAGE"
    git commit -m "$MESSAGE"
    
    if [ $? -eq 0 ]; then
        echo "✅ Commit créé avec succès!"
        
        # Pousser vers le dépôt distant avec retry
        echo ""
        echo "🚀 Poussage vers origin/main..."
        MAX_RETRIES=3
        RETRY_COUNT=0
        PUSH_SUCCESS=0
        
        while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ $PUSH_SUCCESS -eq 0 ]; do
            if [ $RETRY_COUNT -gt 0 ]; then
                echo "🔄 Nouvelle tentative ($RETRY_COUNT/$MAX_RETRIES)..."
                sleep 2
            fi
            
            git push origin main
            if [ $? -eq 0 ]; then
                PUSH_SUCCESS=1
                echo "✅ Push réussi!"
                echo ""
                echo "📊 État final:"
                git status --short
            else
                RETRY_COUNT=$((RETRY_COUNT + 1))
                if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                    echo "⚠️ Échec du push, nouvelle tentative dans 2 secondes..."
                else
                    echo "❌ Erreur lors du push après $MAX_RETRIES tentatives!"
                    echo "💡 Vérifiez votre connexion et essayez manuellement: git push origin main"
                    exit 1
                fi
            fi
        done
    else
        echo "❌ Erreur lors de la création du commit!"
        exit 1
    fi
else
    echo "⚠️ Aucun fichier à committer (peut-être ignorés par .gitignore)"
fi

echo ""
echo "✅ Terminé!"

