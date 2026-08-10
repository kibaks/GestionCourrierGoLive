<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Rappel extends Model
{
    use HasUuids;

    protected $table = 'rappels';

    protected $fillable = [
        'assignation_id',
        'courrier_id',
        'date_rappel',
        'envoye',
        'envoye_at',
        'message',
    ];

    protected $casts = [
        'date_rappel' => 'datetime',
        'envoye_at' => 'datetime',
        'envoye' => 'boolean',
    ];

    public function assignation(): BelongsTo
    {
        return $this->belongsTo(Assignation::class);
    }

    public function courrier(): BelongsTo
    {
        return $this->belongsTo(Courrier::class);
    }

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'assignationId' => $arr['assignation_id'],
            'courrierId' => $arr['courrier_id'],
            'dateRappel' => $this->date_rappel?->format('c'),
            'envoye' => (bool) ($arr['envoye'] ?? false),
            'message' => $arr['message'] ?? null,
            'createdAt' => $this->created_at?->format('c'),
        ];
    }
}
