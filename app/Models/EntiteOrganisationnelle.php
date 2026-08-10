<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EntiteOrganisationnelle extends Model
{
    use HasUuids;

    protected $table = 'entites_organisationnelles';

    protected $fillable = ['nom', 'type', 'description', 'parent_id', 'ordre', 'actif', 'responsable_id'];

    protected $casts = ['actif' => 'boolean', 'ordre' => 'integer'];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(EntiteOrganisationnelle::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(EntiteOrganisationnelle::class, 'parent_id')->orderBy('ordre');
    }

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'nom' => $arr['nom'],
            'type' => $arr['type'],
            'description' => $arr['description'] ?? null,
            'parentId' => $arr['parent_id'] ?? null,
            'ordre' => (int) ($arr['ordre'] ?? 0),
            'actif' => (bool) ($arr['actif'] ?? true),
            'responsableId' => $arr['responsable_id'] ?? null,
        ];
    }
}
