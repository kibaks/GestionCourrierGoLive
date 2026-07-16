# Système de Gestion des Courriers

Application web complète pour la gestion des courriers internes et externes avec workflow, assignations, annotations et rappels.

## Fonctionnalités principales

### 1. Enregistrement des courriers
- **Par le secrétaire** : Enregistrement des courriers entrants (internes ou externes)
- Informations complètes : type, date de réception, expéditeur, destinataire, objet, priorité
- Attribution automatique à une direction et/ou un service
- Upload de fichiers joints (PDF, DOC, DOCX, images)
- Génération automatique de numéros uniques (INT-YYYY-XXXX ou EXT-YYYY-XXXX)

### 2. Workflow du courrier
- **Par le Directeur Général** : Création et gestion des workflows
- Définition d'étapes personnalisées pour chaque courrier
- Assignation d'utilisateurs à chaque étape
- Suivi du statut : EN_ATTENTE, EN_COURS, TERMINE, REJETE
- Commentaires et instructions pour chaque étape

### 3. Assignations et annotations
- **Assignations** : Attribution de courriers à des utilisateurs spécifiques
  - Date d'échéance optionnelle
  - Instructions détaillées
  - Suivi du statut (EN_ATTENTE, EN_COURS, TERMINE)
  
- **Annotations et minutes** : Ajout de commentaires, notes et minutes
  - Types : COMMENTAIRE, NOTE, MINUTE
  - Éditeur de texte riche (ReactQuill)
  - Horodatage automatique
  - Affichage de l'auteur

### 4. Système de rappels
- Création de rappels pour les tâches assignées
- Date et heure de rappel personnalisables
- Message optionnel
- Notifications visuelles pour les échéances proches ou dépassées
- Envoi automatique des rappels (à intégrer avec un service d'email en production)

### 5. Gestion des accès par direction/service
- **Directeur Général** : Accès à tous les courriers
- **Secrétaire** : Accès à tous les courriers (enregistrement uniquement)
- **Directeur** : Accès aux courriers de sa direction uniquement
- **Chef de Service** : Accès aux courriers de son service uniquement
- **Agent** : Accès uniquement aux courriers qui lui sont assignés

## Structure des rôles

### Rôles disponibles
- `SECRETAIRE` : Enregistre les courriers
- `DIRECTEUR_GENERAL` : Gère les workflows, voit tous les courriers
- `DIRECTEUR` : Voit les courriers de sa direction
- `CHEF_SERVICE` : Voit les courriers de son service
- `AGENT` : Voit uniquement ses courriers assignés

## Structure des données

### Directions et Services
Le système inclut des directions et services prédéfinis :
- **Direction Administrative** : Service RH, Service Juridique
- **Direction Financière** : Service Comptabilité, Service Trésorerie
- **Direction Technique** : Division Informatique, Service Maintenance
- **Direction Commerciale** : Service Ventes, Service Marketing

### Statuts des courriers
- `ENREGISTRE` : Courrier enregistré par le secrétaire
- `EN_ATTENTE_DG` : En attente de traitement par le DG
- `EN_TRAITEMENT` : En cours de traitement
- `ASSIGNE` : Assigné à un utilisateur
- `TRAITE` : Traité et terminé
- `ARCHIVE` : Archivé

### Priorités
- `BASSE` : Priorité basse
- `NORMALE` : Priorité normale
- `HAUTE` : Priorité haute
- `URGENTE` : Priorité urgente

## Utilisation

### Connexion
Les utilisateurs de démonstration sont :
- **Secrétaire** : `secretaire@example.com` / `password`
- **Directeur Général** : `dg@example.com` / `password`
- **Directeur** : `directeur@example.com` / `password`
- **Chef de Service** : `chef@example.com` / `password`

### Workflow typique

1. **Enregistrement** (Secrétaire)
   - Le secrétaire enregistre un nouveau courrier
   - Le courrier reçoit le statut `ENREGISTRE`

2. **Création du workflow** (Directeur Général)
   - Le DG consulte les courriers en attente
   - Il crée un workflow avec des étapes
   - Chaque étape est assignée à un utilisateur

3. **Traitement** (Utilisateurs assignés)
   - Les utilisateurs voient leurs tâches dans "Rappels"
   - Ils peuvent ajouter des annotations et minutes
   - Ils marquent les étapes comme terminées

4. **Suivi** (Tous les utilisateurs)
   - Chaque utilisateur voit les courriers selon ses permissions
   - Les rappels alertent sur les échéances proches
   - Le tableau de bord affiche les statistiques

## Technologies utilisées

- **React 18** : Framework frontend
- **TypeScript** : Typage statique
- **Vite** : Build tool
- **Tailwind CSS** : Styling
- **React Router DOM** : Navigation
- **ReactQuill** : Éditeur de texte riche
- **LocalStorage** : Stockage local (à remplacer par une API en production)

## Architecture

### Services
- `courrierService.ts` : Gestion des courriers, workflows, annotations, assignations, rappels
- `directionService.ts` : Gestion des directions et services
- `userService.ts` : Gestion des utilisateurs

### Pages principales
- `Dashboard.tsx` : Tableau de bord avec statistiques
- `ListeCourriers.tsx` : Liste des courriers avec filtres
- `DetailCourrier.tsx` : Détails d'un courrier avec annotations et assignations
- `EnregistrerCourrier.tsx` : Formulaire d'enregistrement
- `Workflow.tsx` : Gestion des workflows (DG uniquement)
- `Rappels.tsx` : Gestion des rappels et tâches assignées

## Améliorations futures

- [ ] Intégration avec une API backend
- [ ] Système d'authentification complet (JWT, OAuth)
- [ ] Envoi d'emails pour les rappels
- [ ] Upload de fichiers vers un serveur
- [ ] Recherche avancée avec filtres multiples
- [ ] Export PDF des courriers
- [ ] Historique complet des actions
- [ ] Notifications en temps réel
- [ ] Tableau de bord avec graphiques
- [ ] Gestion des signatures électroniques

## Installation et démarrage

```bash
# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev

# Build pour production
npm run build
```

L'application sera accessible sur `http://localhost:5173`

## Notes importantes

- Les données sont stockées dans le localStorage du navigateur
- En production, il faudra remplacer le localStorage par une API backend
- Les fichiers uploadés ne sont pas encore gérés (TODO dans le code)
- Les rappels ne sont pas encore envoyés par email (à implémenter)

