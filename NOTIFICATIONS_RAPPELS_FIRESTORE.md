# Système de Notifications et Rappels avec Firestore

## 📋 Vue d'ensemble

Le système de notifications et rappels a été entièrement intégré avec Firestore pour assurer la persistance des données et la synchronisation en temps réel.

## 🗂️ Collections Firestore

### 1. Collection `notifications`

Structure d'une notification :
```typescript
{
  id: string;
  userId: string;              // Utilisateur destinataire
  type: 'assignation' | 'rappel' | 'echeance' | 'workflow' | 'courrier' | 'system';
  title: string;
  message: string;
  read: boolean;
  relatedId?: string;           // ID de l'assignation, courrier, etc.
  relatedType?: 'assignation' | 'courrier' | 'workflow' | 'rappel';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  actionUrl?: string;           // URL pour accéder à l'élément lié
  createdAt: Date;
  readAt?: Date;
  metadata?: Record<string, any>; // Données supplémentaires
}
```

**Index recommandés** :
- `userId` + `createdAt` (desc)
- `userId` + `read` + `createdAt` (desc)
- `userId` + `type` + `createdAt` (desc)

### 2. Collection `rappels`

Structure d'un rappel :
```typescript
{
  id: string;
  assignationId: string;
  courrierId: string;
  dateRappel: Date;
  envoye: boolean;
  message?: string;
  createdAt: Date;
  envoyeAt?: Date;
}
```

**Index recommandés** :
- `envoye` + `dateRappel` (asc)
- `assignationId` + `dateRappel` (asc)

## 🔧 Services

### `notificationService`

Service principal pour la gestion des notifications :

**Méthodes principales** :
- `createNotification()` - Créer une notification
- `getNotificationsByUser()` - Récupérer les notifications d'un utilisateur
- `markAsRead()` - Marquer une notification comme lue
- `markAllAsRead()` - Marquer toutes les notifications comme lues
- `deleteNotification()` - Supprimer une notification
- `subscribeToNotifications()` - S'abonner aux notifications en temps réel
- `getUnreadCount()` - Obtenir le nombre de notifications non lues

**Méthodes spécialisées** :
- `notifyAssignation()` - Créer une notification pour une assignation
- `notifyRappel()` - Créer une notification pour un rappel
- `notifyEcheance()` - Créer une notification pour une échéance
- `notifyWorkflowChange()` - Créer une notification pour un changement de workflow
- `notifySystem()` - Créer une notification système

### `courrierServiceFirebase`

Méthodes mises à jour pour les rappels :
- `createRappelAsync()` - Créer un rappel dans Firestore
- `getRappelsAEnvoyerAsync()` - Récupérer les rappels à envoyer
- `marquerRappelEnvoyeAsync()` - Marquer un rappel comme envoyé
- `checkEcheancesAndNotify()` - Vérifier les échéances et créer des notifications

## 🔔 Types de Notifications

### 1. Assignation (`assignation`)
Créée automatiquement lorsqu'une tâche est assignée à un utilisateur.

**Déclencheurs** :
- Création d'une assignation via `createAssignation()`

**Priorité** :
- `urgent` : Si l'échéance est dans moins de 3 jours
- `normal` : Sinon

### 2. Rappel (`rappel`)
Créée lorsqu'un rappel est programmé.

**Déclencheurs** :
- Création d'un rappel via `createRappelAsync()`

**Priorité** : `high`

### 3. Échéance (`echeance`)
Créée automatiquement pour les échéances proches ou dépassées.

**Déclencheurs** :
- Appel de `checkEcheancesAndNotify()`
- Vérification automatique (à implémenter dans un cron job ou service worker)

**Priorité** :
- `urgent` : Si l'échéance est dépassée
- `high` : Si l'échéance est dans moins de 3 jours

### 4. Workflow (`workflow`)
Créée lors de changements dans le workflow d'un courrier.

**Déclencheurs** :
- Changement d'étape dans un workflow
- Validation/Rejet d'une étape

### 5. Courrier (`courrier`)
Créée pour les événements liés aux courriers.

**Déclencheurs** :
- Création d'un nouveau courrier
- Modification importante d'un courrier

### 6. Système (`system`)
Notifications système pour les administrateurs.

**Déclencheurs** :
- Événements système
- Alertes de maintenance
- Notifications administratives

## 📱 Interface Utilisateur

### Layout.tsx

Le composant `Layout` affiche les notifications dans le header :
- Badge avec le nombre de notifications non lues
- Dropdown avec la liste des notifications
- Clic sur une notification pour la marquer comme lue et naviguer vers l'élément lié
- Bouton "Tout marquer comme lu"
- Lien vers la page des rappels

**Fonctionnalités** :
- Synchronisation en temps réel avec Firestore
- Affichage des notifications non lues en premier
- Indicateur visuel pour les notifications non lues
- Navigation automatique vers l'élément lié

### Rappels.tsx

La page des rappels permet de :
- Voir les tâches assignées
- Créer des rappels pour les assignations
- Envoyer les rappels programmés
- Filtrer par statut et échéance

**Fonctionnalités** :
- Chargement depuis Firestore
- Création de rappels avec persistance
- Marquage des rappels comme envoyés
- Affichage des échéances proches/dépassées

## 🔄 Synchronisation en Temps Réel

Le système utilise les listeners Firestore (`onSnapshot`) pour :
- Mettre à jour automatiquement la liste des notifications
- Afficher les nouvelles notifications sans rechargement
- Synchroniser l'état de lecture des notifications

## 🎯 Niveaux d'Accès

Les notifications sont filtrées selon le niveau d'accès de l'utilisateur :

- **SUPER_ADMIN** : Voit toutes les notifications système
- **DIRECTEUR_GENERAL** : Voit les notifications de workflow et assignations
- **DIRECTEUR** : Voit les notifications de sa direction
- **CHEF_SERVICE** : Voit les notifications de son service
- **AGENT** : Voit uniquement ses notifications personnelles
- **SECRETAIRE** : Voit les notifications de création de courriers

## 🚀 Utilisation

### Créer une notification manuellement

```typescript
import { notificationService } from '../services/notificationService';

await notificationService.createNotification({
  userId: 'user123',
  type: 'system',
  title: 'Nouvelle fonctionnalité',
  message: 'Une nouvelle fonctionnalité est disponible',
  priority: 'normal',
});
```

### Créer une notification d'assignation

```typescript
await notificationService.notifyAssignation({
  userId: 'user123',
  assignationId: 'assign123',
  courrierId: 'courrier456',
  courrierNumero: 'EXT-2024-0001',
  courrierObjet: 'Demande de devis',
  dateEcheance: new Date('2024-12-31'),
  priority: 'normal',
});
```

### S'abonner aux notifications

```typescript
const unsubscribe = notificationService.subscribeToNotifications(
  userId,
  (notifications) => {
    console.log('Nouvelles notifications:', notifications);
  },
  { unreadOnly: true }
);

// N'oubliez pas de vous désabonner
unsubscribe();
```

## 📝 Prochaines Étapes

1. **Cron Job pour les échéances** : Implémenter un service qui vérifie régulièrement les échéances
2. **Notifications par email** : Ajouter l'envoi d'emails pour les notifications importantes
3. **Préférences de notification** : Permettre aux utilisateurs de configurer leurs préférences
4. **Notifications push** : Implémenter les notifications push pour le navigateur
5. **Historique des notifications** : Ajouter une page pour voir l'historique complet

## 🔒 Règles de Sécurité Firestore

Assurez-vous d'ajouter les règles suivantes dans `firestore.rules` :

```javascript
// Notifications
match /notifications/{notificationId} {
  allow read: if request.auth != null && 
    (resource.data.userId == request.auth.uid || 
     get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.role in ['SUPER_ADMIN', 'DIRECTEUR_GENERAL']);
  allow create: if request.auth != null;
  allow update: if request.auth != null && 
    (resource.data.userId == request.auth.uid || 
     get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.role in ['SUPER_ADMIN', 'DIRECTEUR_GENERAL']);
  allow delete: if request.auth != null && 
    (resource.data.userId == request.auth.uid || 
     get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.role in ['SUPER_ADMIN', 'DIRECTEUR_GENERAL']);
}

// Rappels
match /rappels/{rappelId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
  allow delete: if request.auth != null && 
    get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.role in ['SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'SECRETAIRE'];
}
```

