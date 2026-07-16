<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Annotation extends Model
{
    use HasUuids;

    protected $table = 'annotations';

    protected $fillable = [
        'courrier_id',
        'created_by',
        'contenu',
        'type',
        'workflow_etape_id',
        'fichiers',
    ];

    protected $casts = [
        'fichiers' => 'array',
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
            'auteur' => $arr['created_by'],
            'createdBy' => $arr['created_by'],
            'contenu' => $arr['contenu'],
            'type' => $arr['type'],
            'dateCreation' => $this->created_at?->format('c'),
            'workflowEtapeId' => $arr['workflow_etape_id'] ?? null,
            'fichiers' => $arr['fichiers'] ?? null,
        ];
    }
}
