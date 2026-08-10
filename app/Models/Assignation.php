<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Assignation extends Model
{
    use HasUuids;

    protected $table = 'assignations';

    protected $fillable = [
        'courrier_id',
        'assigne_a',
        'assigne_par',
        'date_assignation',
        'date_echeance',
        'statut',
        'instructions',
    ];

    protected $casts = [
        'date_assignation' => 'datetime',
        'date_echeance' => 'datetime',
    ];

    public function courrier(): BelongsTo
    {
        return $this->belongsTo(Courrier::class);
    }

    public function assigneA(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigne_a', 'id');
    }

    public function assignePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigne_par', 'id');
    }

    public function rappels(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Rappel::class);
    }

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'courrierId' => $arr['courrier_id'],
            'assigneA' => $arr['assigne_a'],
            'assignePar' => $arr['assigne_par'],
            'dateAssignation' => $this->date_assignation?->format('c'),
            'dateEcheance' => $this->date_echeance?->format('c'),
            'statut' => $arr['statut'],
            'instructions' => $arr['instructions'] ?? null,
        ];
    }
}
