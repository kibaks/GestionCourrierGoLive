<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EntiteTypeDefinition extends Model
{
    use HasUuids;

    protected $table = 'entite_type_definitions';

    protected $fillable = ['code', 'libelle_singulier', 'libelle_pluriel', 'description', 'icone', 'ordre', 'actif'];

    protected $casts = ['actif' => 'boolean', 'ordre' => 'integer'];

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'code' => $arr['code'],
            'libelleSingulier' => $arr['libelle_singulier'],
            'libellePluriel' => $arr['libelle_pluriel'],
            'description' => $arr['description'] ?? null,
            'icone' => $arr['icone'] ?? null,
            'ordre' => (int) ($arr['ordre'] ?? 0),
            'actif' => (bool) ($arr['actif'] ?? true),
        ];
    }
}
