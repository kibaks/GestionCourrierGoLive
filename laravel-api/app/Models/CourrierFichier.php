<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class CourrierFichier extends Model
{
    use HasUuids;

    protected $table = 'courrier_fichiers';

    protected $fillable = [
        'nom',
        'type',
        'courrier_id',
        'parent_id',
        'chemin',
        'extension',
        'taille',
        'est_accuse_reception',
        'cree_par',
    ];

    protected $casts = [
        'est_accuse_reception' => 'boolean',
        'taille' => 'integer',
    ];

    public function courrier(): BelongsTo
    {
        return $this->belongsTo(Courrier::class, 'courrier_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(CourrierFichier::class, 'parent_id');
    }

    /**
     * Réponse API en camelCase pour le front React.
     */
    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'nom' => $arr['nom'],
            'type' => $arr['type'],
            'courrierId' => $arr['courrier_id'],
            'parentId' => $arr['parent_id'] ?? null,
            'chemin' => $this->getCheminOrUrl(),
            'extension' => $arr['extension'] ?? null,
            'taille' => $arr['taille'] ?? null,
            'estAccuseReception' => (bool) ($arr['est_accuse_reception'] ?? false),
            'dateCreation' => $this->created_at?->format('c'),
            'dateModification' => $this->updated_at?->format('c'),
            'creePar' => $arr['cree_par'],
        ];
    }

    /**
     * Retourne l'URL de téléchargement si chemin présent, sinon le chemin brut.
     */
    public function getCheminOrUrl(): ?string
    {
        if (!$this->chemin) {
            return null;
        }
        if (str_starts_with($this->chemin, 'http')) {
            return $this->chemin;
        }
        return url('api/fichiers/' . $this->id . '/download');
    }
}
