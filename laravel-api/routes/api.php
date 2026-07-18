<?php

use App\Http\Controllers\Api\AnnotationsController;
use App\Http\Controllers\Api\AssignationsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ConfigFormulaireController;
use App\Http\Controllers\Api\CourrierController;
use App\Http\Controllers\Api\CourrierFolderController;
use App\Http\Controllers\Api\CourrierFichierController;
use App\Http\Controllers\Api\ScanPreviewController;
use App\Http\Controllers\Api\DepartementsController;
use App\Http\Controllers\Api\EntiteTypesController;
use App\Http\Controllers\Api\EntitesOrganisationnellesController;
use App\Http\Controllers\Api\RappelsController;
use App\Http\Controllers\Api\ResponsabilitesController;
use App\Http\Controllers\Api\RolesController;
use App\Http\Controllers\Api\UsersController;
use App\Http\Controllers\Api\NotificationsController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\WorkflowEtapesController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Gestion Courrier - JWT + permissions (aligné Firebase)
|--------------------------------------------------------------------------
*/

// ----- Santé API (public, pour détection de connexion front) -----
Route::get('health', fn () => response()->json(['ok' => true, 'ts' => now()->toIso8601String()]));

// ----- Debug : lister les routes API (uniquement si APP_DEBUG=true) -----
Route::get('debug/routes', function () {
    if (!config('app.debug')) {
        return response()->json(['message' => 'Disponible uniquement en mode debug (APP_DEBUG=true)'], 404);
    }
    $routes = collect(\Illuminate\Support\Facades\Route::getRoutes())
        ->filter(fn ($r) => str_starts_with($r->uri(), 'api/'))
        ->map(fn ($r) => ['method' => implode('|', $r->methods()), 'uri' => $r->uri()])
        ->values()
        ->toArray();
    return response()->json([
        'message' => 'Liste des routes API (préfixe api/ déjà inclus)',
        'base_url' => config('app.url'),
        'routes' => $routes,
    ]);
});

// ----- Auth (public) -----
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
Route::post('auth/two-factor', [AuthController::class, 'completeTwoFactorLogin'])->middleware('throttle:5,1');
Route::post('auth/forgot-password', [PasswordResetController::class, 'requestReset'])->middleware('throttle:3,1');
Route::post('auth/reset-password', [PasswordResetController::class, 'reset'])->middleware('throttle:5,1');
Route::post('profile/confirm-email', [ProfileController::class, 'confirmEmailChange'])->middleware('throttle:5,1');
Route::post('auth/register', [AuthController::class, 'register'])->middleware('throttle:5,1');

// ----- Toutes les routes suivantes protégées JWT -----
Route::middleware('auth:api')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::get('auth/permissions', [AuthController::class, 'permissions']);
    Route::post('auth/refresh', [AuthController::class, 'refresh']);
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('profile', [ProfileController::class, 'show']);
    Route::put('profile', [ProfileController::class, 'update']);
    Route::post('profile/photo', [ProfileController::class, 'photo'])->middleware('throttle:10,1');
    Route::post('profile/cover', [ProfileController::class, 'cover'])->middleware('throttle:10,1');
    Route::post('profile/email-change', [ProfileController::class, 'requestEmailChange'])->middleware('throttle:3,1');
    Route::post('profile/sms-verification', [ProfileController::class, 'requestSmsVerification'])->middleware('throttle:3,10');
    Route::post('profile/sms-verification/confirm', [ProfileController::class, 'confirmSmsVerification'])->middleware('throttle:5,10');
    Route::put('profile/password', [ProfileController::class, 'changePassword'])->middleware('throttle:5,1');
    Route::post('profile/two-factor', [ProfileController::class, 'beginTwoFactor'])->middleware('throttle:5,1');
    Route::post('profile/two-factor/confirm', [ProfileController::class, 'confirmTwoFactor'])->middleware('throttle:5,1');
    Route::delete('profile/two-factor', [ProfileController::class, 'disableTwoFactor'])->middleware('throttle:5,1');

    // Fichiers par courrier (déclarer AVANT apiResource pour que /courriers/{id}/fichiers soit pris en compte)
    Route::get('courriers/{courrierId}/fichiers', [CourrierFichierController::class, 'index']);
    Route::post('courriers/{courrierId}/fichiers', [CourrierFichierController::class, 'store']);
    Route::get('storage-stats', [CourrierFichierController::class, 'storageStats']);
    Route::get('parametres/import-fichiers', [CourrierFichierController::class, 'importLimits']);
    Route::get('fichiers/{id}', [CourrierFichierController::class, 'show']);
    Route::get('fichiers/{id}/download', [CourrierFichierController::class, 'download']);
    Route::put('fichiers/{id}', [CourrierFichierController::class, 'update']);
    Route::delete('fichiers/{id}', [CourrierFichierController::class, 'destroy']);

    // Prévisualisation des documents scannés (stockage API, même lecture que les PDF)
    Route::post('scan-preview', [ScanPreviewController::class, 'store']);
    Route::get('scan-preview/{previewId}', [ScanPreviewController::class, 'show']);
    Route::delete('scan-preview/{previewId}', [ScanPreviewController::class, 'destroy']);

    // Sous-routes courriers (avant apiResource pour priorité sur /courriers/{id}/...)
    Route::get('courriers/{courrierId}/assignations', [AssignationsController::class, 'indexByCourrier']);
    Route::get('courriers/{courrierId}/annotations', [AnnotationsController::class, 'index']);
    Route::get('courriers/{courrierId}/workflow-etapes', [WorkflowEtapesController::class, 'index']);

    // Import en lot (avant apiResource pour que "bulk" ne soit pas pris pour un id)
    Route::post('courriers/bulk', [CourrierController::class, 'bulkStore']);

    // Mise à jour du statut uniquement (pas de vérification de permission complexe)
    Route::patch('courriers/{id}/statut', [CourrierController::class, 'updateStatut']);

    // Courriers (apiResource : index, show, store, update, destroy)
    Route::apiResource('courriers', CourrierController::class);

    // Dossiers de classement + mapping courrier -> dossier (MySQL priorité, persistance hors ligne)
    Route::get('folders', [CourrierFolderController::class, 'index']);
    Route::post('folders', [CourrierFolderController::class, 'store']);
    Route::put('folders/{id}', [CourrierFolderController::class, 'update']);
    Route::delete('folders', [CourrierFolderController::class, 'destroy']);
    Route::get('folder-map', [CourrierFolderController::class, 'getMap']);
    Route::put('folder-map', [CourrierFolderController::class, 'saveMap']);

    // Assignations
    Route::get('assignations', [AssignationsController::class, 'index']);
    Route::post('assignations', [AssignationsController::class, 'store']);
    Route::put('assignations/{id}', [AssignationsController::class, 'update']);
    Route::delete('assignations/{id}', [AssignationsController::class, 'destroy']);

    // Annotations
    Route::get('annotations/courrier-ids', [AnnotationsController::class, 'courrierIds']); // avant les routes spécifiques
    Route::post('annotations', [AnnotationsController::class, 'store']);

    // Workflow étapes
    Route::get('workflow-etapes/courrier-ids', [WorkflowEtapesController::class, 'courrierIds']); // avant {id}
    Route::post('workflow-etapes', [WorkflowEtapesController::class, 'store']);
    Route::put('workflow-etapes/{id}', [WorkflowEtapesController::class, 'update']);
    Route::post('workflow-etapes/{id}/responses', [WorkflowEtapesController::class, 'addResponse']);
    Route::delete('workflow-etapes/{id}', [WorkflowEtapesController::class, 'destroy']);

    // Rappels
    Route::get('rappels', [RappelsController::class, 'index']);
    Route::post('rappels', [RappelsController::class, 'store']);
    Route::post('rappels/{id}/envoye', [RappelsController::class, 'marquerEnvoye']);

    // Notifications — routes statiques AVANT les routes paramétrées ({id})
    Route::get('notifications', [NotificationsController::class, 'index']);
    Route::post('notifications', [NotificationsController::class, 'store']);
    Route::get('notifications/unread-count', [NotificationsController::class, 'unreadCount']);
    Route::post('notifications/mark-all-read', [NotificationsController::class, 'markAllAsRead']);
    Route::post('notifications/{id}/mark-read', [NotificationsController::class, 'markAsRead']);
    Route::delete('notifications/{id}', [NotificationsController::class, 'destroy']);

    // Utilisateurs (admin SUPER_ADMIN uniquement)
    Route::apiResource('users', UsersController::class)->only(['index', 'show', 'store', 'update', 'destroy']);

    // ----- Paramétrage (lecture auth, écriture SUPER_ADMIN) -----
    Route::get('roles', [RolesController::class, 'index']);
    Route::get('roles/{id}', [RolesController::class, 'show']);
    Route::post('roles', [RolesController::class, 'store']);
    Route::put('roles/{id}', [RolesController::class, 'update']);
    Route::delete('roles/{id}', [RolesController::class, 'destroy']);

    Route::get('departements', [DepartementsController::class, 'index']);
    Route::get('departements/{id}', [DepartementsController::class, 'show']);
    Route::post('departements', [DepartementsController::class, 'store']);
    Route::put('departements/{id}', [DepartementsController::class, 'update']);
    Route::delete('departements/{id}', [DepartementsController::class, 'destroy']);

    Route::get('entites-organisationnelles', [EntitesOrganisationnellesController::class, 'index']);
    Route::get('entites-organisationnelles/{id}', [EntitesOrganisationnellesController::class, 'show']);
    Route::post('entites-organisationnelles', [EntitesOrganisationnellesController::class, 'store']);
    Route::put('entites-organisationnelles/{id}', [EntitesOrganisationnellesController::class, 'update']);
    Route::delete('entites-organisationnelles/{id}', [EntitesOrganisationnellesController::class, 'destroy']);

    Route::get('entite-types', [EntiteTypesController::class, 'index']);
    Route::get('entite-types/labels', [EntiteTypesController::class, 'labels']); // avant {id} pour ne pas capturer "labels"
    Route::get('entite-types/{id}', [EntiteTypesController::class, 'show']);
    Route::post('entite-types', [EntiteTypesController::class, 'store']);
    Route::put('entite-types/{id}', [EntiteTypesController::class, 'update']);
    Route::delete('entite-types/{id}', [EntiteTypesController::class, 'destroy']);

    Route::get('responsabilites', [ResponsabilitesController::class, 'index']);
    Route::get('responsabilites/{id}', [ResponsabilitesController::class, 'show']);
    Route::post('responsabilites', [ResponsabilitesController::class, 'store']);
    Route::put('responsabilites/{id}', [ResponsabilitesController::class, 'update']);
    Route::delete('responsabilites/{id}', [ResponsabilitesController::class, 'destroy']);

    // Config : formulaire (compat) + clés génériques (export, scanners, scanner_backend_url, archive3d)
    Route::get('config/formulaire', [ConfigFormulaireController::class, 'show']);
    Route::put('config/formulaire', [ConfigFormulaireController::class, 'update']);
    Route::get('config/{key}', [ConfigController::class, 'show']);
    Route::put('config/{key}', [ConfigController::class, 'update']);
});
