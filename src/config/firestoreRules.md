# Règles de sécurité Firestore

## Règles complètes pour l'application

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function pour vérifier si l'utilisateur est authentifié
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function pour vérifier si l'utilisateur est admin
    function isAdmin() {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.role == 'SUPER_ADMIN';
    }
    
    // Helper function pour vérifier si l'utilisateur est propriétaire ou admin
    function isOwnerOrAdmin(userId) {
      return isAuthenticated() && (
        request.auth.uid == userId || 
        isAdmin()
      );
    }
    
    // Helper function pour vérifier les permissions basées sur les rôles
    function hasRole(roles) {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.role in roles;
    }
    
    // Helper function pour vérifier l'accès à une direction/service
    function hasAccessToEntity(entityId) {
      let user = get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data;
      return isAuthenticated() && (
        isAdmin() ||
        user.directionId == entityId ||
        user.serviceId == entityId ||
        user.role in ['DIRECTEUR_GENERAL', 'DIRECTEUR']
      );
    }

    // ==========================================
    // COURRIERS
    // ==========================================
    match /courriers/{courrierId} {
      // Lecture : accessible si l'utilisateur est authentifié et a les permissions
      allow read: if isAuthenticated() && (
        isAdmin() ||
        resource.data.createdBy == request.auth.uid ||
        resource.data.directionId in get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.accessibleDirections ||
        resource.data.serviceId in get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.accessibleServices
      );
      
      // Création : tous les utilisateurs authentifiés peuvent créer
      allow create: if isAuthenticated() && 
        request.resource.data.createdBy == request.auth.uid;
      
      // Mise à jour : propriétaire, admin, ou utilisateur avec permissions
      allow update: if isAuthenticated() && (
        isAdmin() ||
        resource.data.createdBy == request.auth.uid ||
        hasAccessToEntity(resource.data.directionId) ||
        hasAccessToEntity(resource.data.serviceId)
      );
      
      // Suppression : seulement admin ou propriétaire
      allow delete: if isAuthenticated() && (
        isAdmin() ||
        resource.data.createdBy == request.auth.uid
      );
    }

    // ==========================================
    // UTILISATEURS
    // ==========================================
    match /utilisateurs/{userId} {
      // Lecture : tous les utilisateurs authentifiés peuvent lire
      allow read: if isAuthenticated();
      
      // Création : seulement admin
      allow create: if isAdmin();
      
      // Mise à jour : admin ou l'utilisateur lui-même (pour son propre profil)
      allow update: if isAuthenticated() && (
        isAdmin() ||
        request.auth.uid == userId
      );
      
      // Suppression : seulement admin
      allow delete: if isAdmin();
    }

    // ==========================================
    // ARCHIVAGE
    // ==========================================
    match /archivage_locaux/{localId} {
      allow read, write: if isAuthenticated();
    }
    
    match /archivage_armoires/{armoireId} {
      allow read, write: if isAuthenticated();
    }
    
    match /archivage_etageres/{etagereId} {
      allow read, write: if isAuthenticated();
    }
    
    match /archivage_boites/{boiteId} {
      allow read, write: if isAuthenticated();
    }
    
    match /archivage_archives/{archiveId} {
      allow read, write: if isAuthenticated();
    }

    // ==========================================
    // CONFIGURATION
    // ==========================================
    match /config/{configId} {
      // Lecture : tous les utilisateurs authentifiés
      allow read: if isAuthenticated();
      
      // Écriture : seulement admin
      allow write: if isAdmin();
    }

    // ==========================================
    // ENTITÉS ORGANISATIONNELLES
    // ==========================================
    match /entites_organisationnelles/{entiteId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && (
        isAdmin() ||
        hasRole(['DIRECTEUR_GENERAL', 'DIRECTEUR'])
      );
    }

    // ==========================================
    // WORKFLOWS, ANNOTATIONS, ASSIGNATIONS
    // ==========================================
    match /workflows/{workflowId} {
      allow read, write: if isAuthenticated();
    }
    
    match /annotations/{annotationId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && 
        request.resource.data.createdBy == request.auth.uid;
      allow update, delete: if isAuthenticated() && (
        isAdmin() ||
        resource.data.createdBy == request.auth.uid
      );
    }
    
    match /assignations/{assignationId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated() && (
        isAdmin() ||
        hasRole(['DIRECTEUR_GENERAL', 'DIRECTEUR', 'CHEF_SERVICE'])
      );
      allow delete: if isAdmin();
    }
  }
}
```

## Notes importantes

1. **Authentification** : Actuellement, l'application utilise un système d'authentification personnalisé. Pour utiliser ces règles, vous devrez :
   - Soit intégrer Firebase Authentication
   - Soit adapter les règles pour utiliser un système d'authentification personnalisé avec des tokens

2. **Permissions** : Les règles sont basées sur les rôles définis dans votre application (SUPER_ADMIN, DIRECTEUR_GENERAL, etc.)

3. **Sécurité** : Ces règles doivent être ajustées selon vos besoins spécifiques de sécurité

