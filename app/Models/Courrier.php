<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Courrier extends Model
{
    use HasUuids;

    public function assignations(): HasMany
    {
        return $this->hasMany(Assignation::class);
    }

    public function annotations(): HasMany
    {
        return $this->hasMany(Annotation::class);
    }

    public function workflowEtapes(): HasMany
    {
        return $this->hasMany(WorkflowEtape::class, 'courrier_id');
    }

    public function fichiers(): HasMany
    {
        return $this->hasMany(CourrierFichier::class, 'courrier_id');
    }

    protected $table = 'courriers';

    protected $fillable = [
        'id', // pour sync Firestore → MySQL (création avec ID existant)
        'numero',
        'client_request_id', // (C3) idempotence anti-doublons — DOIT être fillable, sinon l'insertion est silencieusement ignorée
        'type',
        'sens', // ENTRANT, SORTANT — formulaire courrier
        'date_reception',
        'date_enregistrement',
        'expediteur',
        'destinataire',
        'objet',
        'priorite',
        'statut',
        'enregistre_par',
        'direction',
        'service',
        'fichier',
        'extra_fields',
    ];

    protected $casts = [
        'date_reception' => 'datetime',
        'date_enregistrement' => 'datetime',
        'extra_fields' => 'array',
    ];

    /**
     * Attributs exposés en camelCase pour l'API (front React).
     */
    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'numero' => $arr['numero'],
            'clientRequestId' => $arr['client_request_id'] ?? null,
            'type' => $arr['type'],
            'sens' => $arr['sens'] ?? null,
            'dateReception' => $this->date_reception?->format('c'),
            'dateEnregistrement' => $this->date_enregistrement?->format('c'),
            'expediteur' => $arr['expediteur'],
            'destinataire' => $arr['destinataire'],
            'objet' => $arr['objet'],
            'priorite' => $arr['priorite'],
            'statut' => $arr['statut'],
            'enregistrePar' => $arr['enregistre_par'],
            'createdBy' => $arr['enregistre_par'], // Aligné Firebase (même logique de stockage)
            'direction' => $arr['direction'] ?? null,
            'service' => $arr['service'] ?? null,
            'fichier' => $arr['fichier'] ?? null,
            'extraFields' => $arr['extra_fields'] ?? null,
            'createdAt' => $this->created_at?->format('c'),
            'updatedAt' => $this->updated_at?->format('c'),
        ];
    }
}
