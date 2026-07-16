#!/bin/bash

# Script de test pour l'API de détection des scanners
# Usage: ./test-scanner-api.sh

BASE_URL="http://localhost:3001"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Tests de l'API Scanner"
echo "=========================="
echo ""

# Test 1: Health check
echo "1️⃣  Test du health check..."
HEALTH_RESPONSE=$(curl -s "$BASE_URL/api/health")
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✅ Serveur actif${NC}"
    echo "   Réponse: $HEALTH_RESPONSE"
else
    echo -e "${RED}❌ Serveur non disponible${NC}"
    exit 1
fi
echo ""

# Test 2: Détection des scanners
echo "2️⃣  Test de la détection des scanners..."
DETECT_RESPONSE=$(curl -s "$BASE_URL/api/scanners/detect")
SCANNER_COUNT=$(echo "$DETECT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data))" 2>/dev/null || echo "0")

if [ "$SCANNER_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ $SCANNER_COUNT scanner(s) détecté(s)${NC}"
    echo "$DETECT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$DETECT_RESPONSE"
else
    echo -e "${YELLOW}⚠️  Aucun scanner détecté${NC}"
    echo "   (C'est normal si aucun scanner n'est connecté)"
    echo "   Réponse: $DETECT_RESPONSE"
fi
echo ""

# Test 3: Vérification des scanners réseau (si configurés)
echo "3️⃣  Test de la détection des scanners réseau..."
NETWORK_SCANNERS=$(echo "$DETECT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); network = [s for s in data if s.get('type') == 'network']; print(len(network))" 2>/dev/null || echo "0")
if [ "$NETWORK_SCANNERS" -gt 0 ]; then
    echo -e "${GREEN}✅ $NETWORK_SCANNERS scanner(s) réseau détecté(s)${NC}"
else
    echo -e "${YELLOW}ℹ️  Aucun scanner réseau configuré${NC}"
fi
echo ""

# Test 4: Vérification de la plateforme
PLATFORM=$(uname -s)
echo "4️⃣  Plateforme détectée: $PLATFORM"
if [ "$PLATFORM" = "Darwin" ]; then
    echo "   - Détection USB via system_profiler"
    echo "   - Détection via ioreg"
    echo "   - Pour TWAIN, utilisez Windows"
elif [ "$PLATFORM" = "Linux" ]; then
    echo "   - Détection USB"
    echo "   - Pour TWAIN, utilisez Windows"
else
    echo "   - Détection TWAIN/WIA"
    echo "   - Détection via pilotes fabricant"
fi
echo ""

# Résumé
echo "📊 Résumé des tests"
echo "==================="
echo -e "   Serveur: ${GREEN}✅ Actif${NC}"
echo -e "   Scanners détectés: ${YELLOW}$SCANNER_COUNT${NC}"
echo ""
echo "💡 Pour tester avec un scanner:"
echo "   1. Connectez votre scanner (USB ou réseau)"
echo "   2. Relancez ce script: ./test-scanner-api.sh"
echo "   3. Ou utilisez l'interface web de l'application"
echo ""

