<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkflowEtape extends Model
{
    use HasUuids;

    protected $table = 'workflow_etapes';

    protected $fillable = [
        'courrier_id',
        'etape',
        'assigne_a',
        'statut',
        'date_debut',
        'date_fin',
        'commentaire',
        'cree_par',
        'duree_estimee',
        'declencheur',
        'ordre',
        'est_condition',
        'action_si_vrai',
        'action_si_faux',
        'responses',
    ];

    protected $casts = [
        'date_debut' => 'datetime',
        'date_fin' => 'datetime',
        'declencheur' => 'array',
        'responses' => 'array',
        'est_condition' => 'boolean',
    ];

    public function courrier(): BelongsTo
    {
        return $this->belongsTo(Courrier::class);
    }

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'courrierId' => $arr['courrier_id'],
            'etape' => $arr['etape'],
            'assigneA' => $arr['assigne_a'],
            'statut' => $arr['statut'],
            'dateDebut' => $this->date_debut?->format('c'),
            'dateFin' => $this->date_fin?->format('c'),
            'commentaire' => $arr['commentaire'] ?? null,
            'creePar' => $arr['cree_par'],
            'createdAt' => $this->created_at?->format('c'),
            'dureeEstimee' => $arr['duree_estimee'] ?? null,
            'declencheur' => $arr['declencheur'] ?? null,
            'ordre' => $arr['ordre'] ?? null,
            'estCondition' => (bool) ($arr['est_condition'] ?? false),
            'actionSiVrai' => $arr['action_si_vrai'] ?? null,
            'actionSiFaux' => $arr['action_si_faux'] ?? null,
            'responses' => $arr['responses'] ?? null,
        ];
    }
}
