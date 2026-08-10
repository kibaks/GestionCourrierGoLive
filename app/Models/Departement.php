<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Departement extends Model
{
    use HasUuids;

    protected $table = 'departements';

    protected $fillable = ['nom', 'code', 'description', 'responsable_id', 'parent_id', 'actif'];

    protected $casts = ['actif' => 'boolean'];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Departement::class, 'parent_id');
    }

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'nom' => $arr['nom'],
            'code' => $arr['code'] ?? null,
            'description' => $arr['description'] ?? null,
            'responsableId' => $arr['responsable_id'] ?? null,
            'parentId' => $arr['parent_id'] ?? null,
            'actif' => (bool) ($arr['actif'] ?? true),
            'dateCreation' => $this->created_at?->format('c'),
            'dateModification' => $this->updated_at?->format('c'),
        ];
    }
}
