<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Archive extends Model
{
    use HasUuids;

    protected $table = 'archives';

    protected $fillable = [
        'id',
        'courrier_id',
        'boite_id',
        'entite_id',
        'direction',
        'numero_classement',
        'date_archivage',
        'archive_par',
        'motif',
        'observations',
        'duree_conservation',
        'date_destruction',
        'statut',
        'historique',
        'document',
    ];

    protected $casts = [
        'date_archivage' => 'datetime',
        'date_destruction' => 'datetime',
        'historique' => 'array',
        'document' => 'array',
        'duree_conservation' => 'integer',
    ];

    public function courrier(): BelongsTo
    {
        return $this->belongsTo(Courrier::class, 'courrier_id');
    }

    /**
     * Attributs exposés en camelCase pour l'API (front React).
     */
    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'courrierId' => $arr['courrier_id'] ?? null,
            'boiteId' => $arr['boite_id'] ?? null,
            'entiteId' => $arr['entite_id'] ?? null,
            'direction' => $arr['direction'] ?? null,
            'numeroClassement' => $arr['numero_classement'],
            'dateArchivage' => $this->date_archivage?->format('c'),
            'archivePar' => $arr['archive_par'],
            'motif' => $arr['motif'] ?? null,
            'observations' => $arr['observations'] ?? null,
            'dureeConservation' => (int) ($arr['duree_conservation'] ?? 10),
            'dateDestruction' => $this->date_destruction?->format('c'),
            'statut' => $arr['statut'],
            'historique' => $arr['historique'] ?? [],
            'document' => $arr['document'] ?? null,
            'createdAt' => $this->created_at?->format('c'),
            'updatedAt' => $this->updated_at?->format('c'),
        ];
    }
}
