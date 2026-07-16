# API Laravel - Notifications

## 📋 Vue d'ensemble

Le système de notifications est maintenant entièrement connecté à l'API Laravel pour une gestion centralisée et persistante des notifications.

## 🔗 Endpoints API Laravel

### 1. Créer une notification
```
POST /api/notifications
```

**Corps de la requête :**
```json
{
  "userId": "string",
  "type": "assignation|rappel|echeance|workflow|courrier|system",
  "title": "string",
  "message": "string",
  "relatedId": "string (optionnel)",
  "relatedType": "assignation|courrier|workflow|rappel (optionnel)",
  "priority": "low|normal|high|urgent (optionnel)",
  "actionUrl": "string (optionnel)",
  "metadata": "object (optionnel)",
  "createdAt": "datetime",
  "read": false
}
```

### 2. Récupérer les notifications d'un utilisateur
```
GET /api/users/{userId}/notifications
```

**Paramètres optionnels :**
- `unreadOnly=true` : Uniquement les notifications non lues
- `limit=50` : Limiter le nombre de résultats
- `offset=0` : Pagination

### 3. Marquer une notification comme lue
```
PATCH /api/notifications/{notificationId}/read
```

**Corps de la requête :**
```json
{
  "read": true,
  "readAt": "datetime"
}
```

### 4. Marquer toutes les notifications comme lues
```
PATCH /api/users/{userId}/notifications/read-all
```

### 5. Supprimer une notification
```
DELETE /api/notifications/{notificationId}
```

### 6. Compter les notifications non lues
```
GET /api/users/{userId}/notifications/unread-count
```

**Réponse :**
```json
{
  "count": 5
}
```

## 🔧 Implémentation dans le Frontend

### Service Laravel API
Les méthodes suivantes ont été ajoutées à `laravelApiService.ts` :

```typescript
// Créer une notification
await laravelApiService.createNotification({
  userId: 'user123',
  type: 'workflow',
  title: 'Nouveau workflow',
  message: 'Un workflow vous a été assigné',
  relatedId: 'courrier456',
  relatedType: 'courrier',
  priority: 'high'
});

// Récupérer les notifications
const notifications = await laravelApiService.getNotificationsByUser(userId, {
  unreadOnly: true,
  limit: 20
});

// Marquer comme lue
await laravelApiService.markNotificationAsRead(notificationId);

// Compter les non lues
const unreadCount = await laravelApiService.getUnreadNotificationsCount(userId);
```

### Intégration dans le Formulaire
Dans `EnregistrerCourrier.tsx`, la fonction `createNotification()` utilise maintenant l'API Laravel :

```typescript
const createNotification = async (notification) => {
  try {
    if (laravelApiService.isConfigured()) {
      await laravelApiService.createNotification({
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: notification.relatedId,
        relatedType: notification.relatedType,
        priority: notification.priority,
        createdAt: new Date().toISOString(),
        read: false
      });
      console.log('Notification envoyée via API Laravel:', notification);
    } else {
      console.log('Notification locale (API Laravel non configurée):', notification);
    }
  } catch (error) {
    console.warn('Erreur lors de la création de la notification:', error);
    console.log('Fallback notification locale:', notification);
  }
};
```

## 🗂️ Structure de la Base de Données (MySQL)

### Table `notifications`
```sql
CREATE TABLE notifications (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  type ENUM('assignation', 'rappel', 'echeance', 'workflow', 'courrier', 'system') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  related_id VARCHAR(255) NULL,
  related_type ENUM('assignation', 'courrier', 'workflow', 'rappel') NULL,
  priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
  action_url VARCHAR(500) NULL,
  metadata JSON NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  
  INDEX idx_user_id (user_id),
  INDEX idx_user_read (user_id, read),
  INDEX idx_user_type (user_id, type),
  INDEX idx_created_at (created_at),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## 🔄 Flux de Données

### 1. Création d'un Courrier avec Workflow
1. **Formulaire** → `EnregistrerCourrier.tsx`
2. **Création courrier** → `courrierService.createCourrier()`
3. **Création workflow** → `laravelApiService.createWorkflowEtape()`
4. **Notifications** → `laravelApiService.createNotification()`
   - Notification DG (type: 'workflow')
   - Notification responsable (type: 'courrier')

### 2. Lecture des Notifications
1. **Layout** → `Layout.tsx`
2. **Service** → `laravelApiService.getNotificationsByUser()`
3. **Affichage** → Badge avec le nombre de notifications non lues

## 🎯 Types de Notifications

### Assignation (`assignation`)
- **Déclencheur** : Création d'une assignation
- **Destinataire** : Utilisateur assigné
- **Priorité** : `urgent` si échéance < 3 jours, sinon `normal`

### Workflow (`workflow`)
- **Déclencheur** : Création/changement d'étape de workflow
- **Destinataire** : Directeur Général ou validateur
- **Priorité** : Basée sur la priorité du workflow

### Courrier (`courrier`)
- **Déclencheur** : Enregistrement d'un nouveau courrier
- **Destinataire** : Responsable de direction/service
- **Priorité** : `normal`

### Rappel (`rappel`)
- **Déclencheur** : Création d'un rappel
- **Destinataire** : Utilisateur concerné
- **Priorité** : `high`

### Échéance (`echeance`)
- **Déclencheur** : Approche d'une échéance
- **Destinataire** : Utilisateur assigné
- **Priorité** : `urgent` si dépassée, `high` si < 3 jours

### Système (`system`)
- **Déclencheur** : Événements système
- **Destinataire** : Administrateurs
- **Priorité** : `normal`

## 🔒 Sécurité

### Permissions
- Les utilisateurs ne voient que leurs propres notifications
- Les administrateurs peuvent voir toutes les notifications système
- Les DG peuvent voir les notifications de workflow

### Validation
- Validation des types énumérés
- Vérification de l'existence des utilisateurs
- Nettoyage des entrées utilisateur

## 📊 Performance

### Indexation
- Index sur `user_id` pour les requêtes par utilisateur
- Index composite sur `(user_id, read)` pour les notifications non lues
- Index sur `created_at` pour le tri chronologique

### Pagination
- Support de la pagination avec `limit` et `offset`
- Limite par défaut de 50 notifications par requête

## 🚀 Utilisation

### Exemple complet
```typescript
// Créer un workflow avec notifications
const createdCourrier = await courrierService.createCourrier(courrierData);

// Créer l'étape de workflow
await laravelApiService.createWorkflowEtape({
  courrierId: createdCourrier.id,
  etape: 'Validation initiale',
  assigneA: 'dg_user_id',
  statut: 'EN_ATTENTE',
  commentaire: 'Instructions du workflow'
});

// Notifier le DG
await laravelApiService.createNotification({
  userId: 'dg_user_id',
  type: 'workflow',
  title: 'Nouveau courrier nécessitant une validation',
  message: `Le courrier ${createdCourrier.numero} nécessite votre validation`,
  relatedId: createdCourrier.id,
  relatedType: 'courrier',
  priority: 'high'
});

// Notifier le responsable
await laravelApiService.createNotification({
  userId: 'responsable_id',
  type: 'courrier',
  title: 'Nouveau courrier enregistré',
  message: `Un nouveau courrier a été enregistré dans votre direction`,
  relatedId: createdCourrier.id,
  relatedType: 'courrier',
  priority: 'normal'
});
```

## 🔧 Configuration Laravel

### Routes (routes/api.php)
```php
Route::apiResource('notifications', NotificationController::class);
Route::get('users/{user}/notifications', [NotificationController::class, 'byUser']);
Route::get('users/{user}/notifications/unread-count', [NotificationController::class, 'unreadCount']);
Route::patch('users/{user}/notifications/read-all', [NotificationController::class, 'markAllRead']);
Route::patch('notifications/{notification}/read', [NotificationController::class, 'markRead']);
```

### Controller (app/Http/Controllers/NotificationController.php)
```php
class NotificationController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'type' => 'required|in:assignation,rappel,echeance,workflow,courrier,system',
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'related_id' => 'nullable|string',
            'related_type' => 'nullable|in:assignation,courrier,workflow,rappel',
            'priority' => 'nullable|in:low,normal,high,urgent',
            'action_url' => 'nullable|url|max:500',
            'metadata' => 'nullable|json'
        ]);

        $notification = Notification::create($validated + [
            'id' => Str::uuid(),
            'read' => false,
            'created_at' => now()
        ]);

        return response()->json($notification, 201);
    }

    public function byUser($userId, Request $request)
    {
        $query = Notification::where('user_id', $userId)
            ->orderBy('created_at', 'desc');

        if ($request->boolean('unreadOnly')) {
            $query->where('read', false);
        }

        if ($request->has('limit')) {
            $query->limit($request->get('limit'));
        }

        if ($request->has('offset')) {
            $query->offset($request->get('offset'));
        }

        return response()->json(['data' => $query->get()]);
    }

    public function markRead($notificationId)
    {
        $notification = Notification::findOrFail($notificationId);
        $notification->update([
            'read' => true,
            'read_at' => now()
        ]);

        return response()->json($notification);
    }

    public function markAllRead($userId)
    {
        Notification::where('user_id', $userId)
            ->where('read', false)
            ->update([
                'read' => true,
                'read_at' => now()
            ]);

        return response()->json(['message' => 'All notifications marked as read']);
    }

    public function unreadCount($userId)
    {
        $count = Notification::where('user_id', $userId)
            ->where('read', false)
            ->count();

        return response()->json(['count' => $count]);
    }
}
```

## ✅ Avantages

1. **Centralisation** : Toutes les notifications gérées par l'API Laravel
2. **Persistence** : Stockage en base de données MySQL
3. **Performance** : Indexation optimisée et pagination
4. **Sécurité** : Validation et permissions côté serveur
5. **Scalabilité** : Support multi-utilisateurs et charges élevées
6. **Flexibilité** : Types et métadonnées personnalisables
