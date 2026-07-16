<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourrierFolder extends Model
{
    use HasUuids;

    protected $table = 'courrier_folders';

    protected $fillable = [
        'name',
        'parent_id',
        'user_id',
        'color',
        'visibility',
        'direction',
        'service',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(CourrierFolder::class, 'parent_id');
    }

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'name' => $arr['name'],
            'parentId' => $arr['parent_id'] ?? null,
            'createdAt' => $this->created_at?->format('c'),
            'updatedAt' => $this->updated_at?->format('c'),
            'userId' => $arr['user_id'],
            'color' => $arr['color'] ?? null,
            'visibility' => $arr['visibility'] ?? 'private',
            'direction' => $arr['direction'] ?? null,
            'service' => $arr['service'] ?? null,
        ];
    }
}
