# Plateforme de Gestion des Dossiers d'Appel d'Offres (DAO/DP) - RDC

Plateforme numérique intégrée utilisant l'IA pour la gestion complète des dossiers d'appel d'offres en République Démocratique du Congo, conforme aux standards de l'ARMP et à la Loi relative aux marchés publics.

## Fonctionnalités principales

### 1. Ingestion & Extraction
- Lecture automatique des DAO/DP et offres (PDF, DOCX, XLSX)
- Extraction des sections ARMP (Avis, Instructions, Cahier des charges, Clauses, Bordereau)
- Extraction des données clés (prix, délais, garanties, pièces administratives)

### 2. Conformité Juridique
- Checklists ARMP paramétrables par type de marché
- Détection d'écarts avec gravité (mineur/majeur/critique)
- Rapport de conformité avec feux (vert/jaune/rouge)
- Vérification des délais légaux et clauses types

### 3. Scoring MEAT (Meilleure Évaluation de l'Offre Techniquement et Économiquement)
- Critères pondérés : prix, technique, délais, garantie/SAV, capacités
- Normalisation automatique des prix
- Panel de notes techniques
- Classement automatique avec scénarios "what-if"
- Seuils d'éligibilité configurables

### 4. Explicabilité & Audit
- Justification de chaque score par citation du document source
- Journalisation complète (horodatage, signatures, versions)
- Rapports PDF/CSV/XLSX conformes aux pratiques RDC
- Traçabilité complète des décisions

### 5. Rôles Utilisateurs
- **Autorité contractante** : Paramétrage, validation
- **Commission d'évaluation** : Notation technique, visa
- **Observateurs/Audit interne** : Lecture, traçabilité
- **Soumissionnaires** : Dépôt d'offres (optionnel)

## Installation

1. Installer les dépendances :
```bash
npm install
```

2. Lancer l'application en mode développement :
```bash
npm run dev
```

3. Ouvrir le navigateur à l'adresse indiquée (généralement http://localhost:5173)

## Structure du projet

- `src/pages/Login.tsx` - Page de connexion
- `src/pages/Home.tsx` - Page d'accueil avec modules principaux
- `src/pages/IngestionDocuments.tsx` - Module d'ingestion et extraction
- `src/pages/ConformiteJuridique.tsx` - Module de conformité ARMP
- `src/pages/ScoringMEAT.tsx` - Module de scoring et évaluation
- `src/pages/Rapports.tsx` - Module de génération de rapports
- `src/pages/Parametres.tsx` - Module de paramétrage
- `src/types/` - Types TypeScript pour les entités
- `src/components/` - Composants réutilisables

## Technologies utilisées

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router DOM

## Architecture IA

- **OCR + NLP** : Extraction et segmentation des documents
- **IA sémantique** : Comparaison avec documents types ARMP
- **Détection d'anomalies** : Prix anormalement bas, délais irréalistes
- **Explicabilité** : Génération de rationales avec références
- **Human-in-the-loop** : L'IA propose, la commission valide

## Feuille de route

- **Phase 1 - Cadrage** : Checklists ARMP, barèmes MEAT, gabarits
- **Phase 2 - MVP** : Ingestion, conformité, scoring, rapports PDF
- **Phase 3 - Production** : Multi-évaluateurs, signatures, scénarios de sensibilité
- **Phase 4 - Améliorations** : Bibliothèque de cas, API d'intégration, benchmarks

