<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Archive;
use App\Models\Courrier;
use App\Models\EntiteOrganisationnelle;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class ArchiveController extends Controller
{
    /**
     * Liste des archives accessibles pour l'utilisateur connecté.
     * Filtrage par direction / entité organisationnelle.
     * GET /api/archives
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $query = $this->getAccessibleArchivesQuery($user);

        if ($request->filled('statut')) {
            $query->where('statut', $request->input('statut'));
        }

        if ($request->filled('direction')) {
            $query->where('direction', $request->input('direction'));
        }

        if ($request->filled('entite_id')) {
            $query->where('entite_id', $request->input('entite_id'));
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function (Builder $q) use ($search) {
                $q->where('numero_classement', 'like', "%{$search}%")
                  ->orWhere('observations', 'like', "%{$search}%")
                  ->orWhere('motif', 'like', "%{$search}%")
                  ->orWhereHas('courrier', function (Builder $cq) use ($search) {
                      $cq->where('numero', 'like', "%{$search}%")
                         ->orWhere('objet', 'like', "%{$search}%");
                  })
                  ->orWhereJsonContains('document->titre', $search);
            });
        }

        $archives = $query->orderBy('date_archivage', 'desc')->get();

        return response()->json(['data' => $archives->map(fn (Archive $a) => $a->toArray())->values()->all()]);
    }

    /**
     * Détail d'une archive.
     * GET /api/archives/{id}
     */
    public function show(string $id): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $archive = Archive::with('courrier')->findOrFail($id);
        if (!$this->canAccessArchive($user, $archive)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }

        return response()->json(['data' => $archive->toArray()]);
    }

    /**
     * Créer une archive (courrier traité ou document direct).
     * POST /api/archives
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-courrier');
        $user = Auth::user();

        $validated = $request->validate([
            'courrierId' => 'nullable|uuid|exists:courriers,id',
            'boiteId' => 'nullable|string|max:64',
            'entiteId' => 'nullable|string|max:64',
            'direction' => 'nullable|string|max:255',
            'motif' => 'nullable|string',
            'observations' => 'nullable|string',
            'dureeConservation' => 'nullable|integer|min:1|max:100',
            'document' => 'nullable|array',
            'document.titre' => 'nullable|string|max:255',
            'document.type' => 'nullable|string|max:64',
            'document.fichier' => 'nullable|string|max:512',
        ]);

        // Si on archive un courrier, vérifier qu'il est accessible et au statut TRAITE
        $courrier = null;
        if (!empty($validated['courrierId'])) {
            $courrier = Courrier::findOrFail($validated['courrierId']);
            if ($courrier->statut !== 'TRAITE') {
                return response()->json([
                    'message' => 'Seuls les courriers au statut TRAITE peuvent être archivés.',
                ], 422);
            }
        }

        // Déterminer la direction / entité
        $direction = $validated['direction'] ?? null;
        $entiteId = $validated['entiteId'] ?? null;

        if ($courrier) {
            $direction = $direction ?? $courrier->direction;
            $entiteId = $entiteId ?? $courrier->extra_fields['entiteId'] ?? null;
        }

        // Fallback sur l'entité de l'utilisateur
        if (!$entiteId && $user->entite_id) {
            $entiteId = $user->entite_id;
        }
        if (!$direction && $user->direction) {
            $direction = $user->direction;
        }

        $dureeConservation = $validated['dureeConservation'] ?? 10;
        $dateArchivage = now();
        $dateDestruction = (clone $dateArchivage)->addYears($dureeConservation);

        $archivePar = $user->id;

        try {
            $archive = DB::transaction(function () use ($validated, $courrier, $direction, $entiteId, $dureeConservation, $dateArchivage, $dateDestruction, $archivePar) {
                $numeroClassement = $this->generateNumeroClassement($dateArchivage->year);

                $historique = [[
                    'id' => (string) Str::uuid(),
                    'archiveId' => '',
                    'action' => 'ARCHIVAGE',
                    'date' => $dateArchivage->format('c'),
                    'utilisateurId' => $archivePar,
                    'motif' => $validated['motif'] ?? null,
                    'observations' => $validated['observations'] ?? 'Archivage initial',
                ]];

                $archive = Archive::create([
                    'id' => (string) Str::uuid(),
                    'courrier_id' => $courrier?->id,
                    'boite_id' => $validated['boiteId'] ?? null,
                    'entite_id' => $entiteId,
                    'direction' => $direction,
                    'numero_classement' => $numeroClassement,
                    'date_archivage' => $dateArchivage,
                    'archive_par' => $archivePar,
                    'motif' => $validated['motif'] ?? null,
                    'observations' => $validated['observations'] ?? null,
                    'duree_conservation' => $dureeConservation,
                    'date_destruction' => $dateDestruction,
                    'statut' => 'ARCHIVE',
                    'historique' => $historique,
                    'document' => $validated['document'] ?? null,
                ]);

                $historique[0]['archiveId'] = $archive->id;
                $archive->update(['historique' => $historique]);

                // Mettre à jour le statut du courrier si nécessaire
                if ($courrier) {
                    $courrier->update(['statut' => 'ARCHIVE']);
                }

                return $archive;
            });

            return response()->json(['data' => $archive->fresh()->toArray()], 201);
        } catch (Throwable $e) {
            Log::error('ArchiveController::store — erreur', ['message' => $e->getMessage()]);
            return response()->json(['message' => 'Erreur lors de la création de l\'archive.'], 500);
        }
    }

    /**
     * Mise à jour du statut d'une archive (CONSULTE, SORTI, DETRUIT).
     * PATCH /api/archives/{id}/statut
     */
    public function updateStatut(Request $request, string $id): JsonResponse
    {
        $this->authorize('modifier-courrier');
        $user = Auth::user();

        $archive = Archive::findOrFail($id);
        if (!$this->canAccessArchive($user, $archive)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }

        $validated = $request->validate([
            'statut' => 'required|in:ARCHIVE,CONSULTE,SORTI,DETRUIT',
            'motif' => 'nullable|string',
            'observations' => 'nullable|string',
        ]);

        $actionMap = [
            'ARCHIVE' => 'RETOUR',
            'CONSULTE' => 'CONSULTATION',
            'SORTI' => 'SORTIE',
            'DETRUIT' => 'DESTRUCTION',
        ];

        $historique = $archive->historique ?? [];
        $historique[] = [
            'id' => (string) Str::uuid(),
            'archiveId' => $archive->id,
            'action' => $actionMap[$validated['statut']] ?? 'MODIFICATION',
            'date' => now()->format('c'),
            'utilisateurId' => $user->id,
            'motif' => $validated['motif'] ?? null,
            'observations' => $validated['observations'] ?? "Statut changé en {$validated['statut']}",
        ];

        $archive->update([
            'statut' => $validated['statut'],
            'historique' => $historique,
        ]);

        return response()->json(['data' => $archive->fresh()->toArray()]);
    }

    /**
     * Retour d'une archive au statut ARCHIVE.
     * POST /api/archives/{id}/retour
     */
    public function retour(string $id): JsonResponse
    {
        $this->authorize('modifier-courrier');
        $user = Auth::user();

        $archive = Archive::findOrFail($id);
        if (!$this->canAccessArchive($user, $archive)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }

        $historique = $archive->historique ?? [];
        $historique[] = [
            'id' => (string) Str::uuid(),
            'archiveId' => $archive->id,
            'action' => 'RETOUR',
            'date' => now()->format('c'),
            'utilisateurId' => $user->id,
            'observations' => 'Retour après sortie/consultation',
        ];

        $archive->update([
            'statut' => 'ARCHIVE',
            'historique' => $historique,
        ]);

        return response()->json(['data' => $archive->fresh()->toArray()]);
    }

    /**
     * Query de base filtrée selon les permissions de l'utilisateur.
     */
    private function getAccessibleArchivesQuery(User $user): Builder
    {
        $query = Archive::query();

        if ($user->isSuperAdmin() || $user->isDirecteurGeneral()) {
            return $query;
        }

        if ($this->isSecretaireDG($user)) {
            return $query;
        }

        // Pour les autres utilisateurs : filtrer par leur direction/entité
        $query->where(function (Builder $q) use ($user) {
            if ($user->entite_id) {
                $q->orWhere('entite_id', $user->entite_id);
            }
            if ($user->direction) {
                $q->orWhere('direction', $user->direction);
            }
            $q->orWhere('archive_par', $user->id);
        });

        return $query;
    }

    /**
     * Vérifie si l'utilisateur peut accéder à une archive spécifique.
     */
    private function canAccessArchive(User $user, Archive $archive): bool
    {
        if ($user->isSuperAdmin() || $user->isDirecteurGeneral()) {
            return true;
        }

        if ($this->isSecretaireDG($user)) {
            return true;
        }

        if ((string) $archive->archive_par === (string) $user->id) {
            return true;
        }

        if ($user->entite_id && (string) $archive->entite_id === (string) $user->entite_id) {
            return true;
        }

        if ($user->direction && $archive->direction === $user->direction) {
            return true;
        }

        return false;
    }

    /**
     * Détermine si un utilisateur est le secrétaire de la Direction Générale.
     * Basé sur l'organigramme (entite_id de type direction_generale) ou fallback sur direction.
     */
    private function isSecretaireDG(User $user): bool
    {
        if (!$user->isSecretaire()) {
            return false;
        }

        if ($user->entite_id) {
            $entite = EntiteOrganisationnelle::find($user->entite_id);
            if ($entite && $entite->type === 'direction_generale') {
                return true;
            }
        }

        $direction = mb_strtolower($user->direction ?? '');
        if (!$direction || str_contains($direction, 'général') || str_contains($direction, 'general')) {
            return true;
        }

        return false;
    }

    /**
     * Génère un numéro de classement unique (ARCH-AAAA-NNNNN).
     * Utilise un verrou de ligne pour éviter les doublons.
     */
    private function generateNumeroClassement(int $annee): string
    {
        $last = Archive::where('numero_classement', 'like', "ARCH-{$annee}-%")
            ->lockForUpdate()
            ->orderBy('numero_classement', 'desc')
            ->value('numero_classement');

        $sequence = 1;
        if ($last && preg_match('/-(\d+)$/', $last, $m)) {
            $sequence = (int) $m[1] + 1;
        }

        return sprintf('ARCH-%d-%05d', $annee, $sequence);
    }
}
