<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class NotificationsController extends Controller
{
    /**
     * Récupérer les notifications de l'utilisateur connecté
     */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();
        $query = Notification::where('userId', $user->id);

        // Filtrer par type si spécifié
        if ($request->has('type')) {
            $query->where('type', $request->get('type'));
        }

        // Filtrer par statut de lecture
        if ($request->get('unreadOnly')) {
            $query->where('read', false);
        }

        // Limiter le nombre de résultats
        if ($request->has('limit')) {
            $query->limit($request->get('limit'));
        }

        $notifications = $query->orderBy('created_at', 'desc')->get();

        return response()->json($notifications);
    }

    /**
     * Créer une nouvelle notification
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'userId' => 'required|string',
            'type' => 'required|string|in:assignation,rappel,echeance,workflow,courrier,system',
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'priority' => 'nullable|string|in:normal,high,urgent',
            'relatedId' => 'nullable|string',
            'relatedType' => 'nullable|string',
            'actionUrl' => 'nullable|string|max:500',
            'metadata' => 'nullable|array'
        ]);

        $notification = Notification::create([
            'userId' => $validated['userId'],
            'type' => $validated['type'],
            'title' => $validated['title'],
            'message' => $validated['message'],
            'priority' => $validated['priority'] ?? 'normal',
            'read' => false,
            'relatedId' => $validated['relatedId'] ?? null,
            'relatedType' => $validated['relatedType'] ?? null,
            'actionUrl' => $validated['actionUrl'] ?? null,
            'metadata' => $validated['metadata'] ?? null,
            'created_at' => now(),
            'updated_at' => now()
        ]);

        return response()->json($notification, 201);
    }

    /**
     * Marquer une notification comme lue
     */
    public function markAsRead(string $id): JsonResponse
    {
        $user = Auth::user();
        $notification = Notification::where('id', $id)
            ->where('userId', $user->id)
            ->first();

        if (!$notification) {
            return response()->json(['message' => 'Notification non trouvée'], 404);
        }

        $notification->update([
            'read' => true,
            'readAt' => now(),
            'updated_at' => now()
        ]);

        return response()->json($notification);
    }

    /**
     * Marquer toutes les notifications de l'utilisateur comme lues
     */
    public function markAllAsRead(): JsonResponse
    {
        $user = Auth::user();
        
        Notification::where('userId', $user->id)
            ->where('read', false)
            ->update([
                'read' => true,
                'readAt' => now(),
                'updated_at' => now()
            ]);

        return response()->json(['message' => 'Toutes les notifications ont été marquées comme lues']);
    }

    /**
     * Supprimer une notification
     */
    public function destroy(string $id): JsonResponse
    {
        $user = Auth::user();
        $notification = Notification::where('id', $id)
            ->where('userId', $user->id)
            ->first();

        if (!$notification) {
            return response()->json(['message' => 'Notification non trouvée'], 404);
        }

        $notification->delete();

        return response()->json(['message' => 'Notification supprimée']);
    }

    /**
     * Compter les notifications non lues
     */
    public function unreadCount(): JsonResponse
    {
        $user = Auth::user();
        $count = Notification::where('userId', $user->id)
            ->where('read', false)
            ->count();

        return response()->json(['count' => $count]);
    }
}
