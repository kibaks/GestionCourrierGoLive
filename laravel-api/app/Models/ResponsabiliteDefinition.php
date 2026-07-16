<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ResponsabiliteDefinition extends Model
{
    use HasUuids;

    protected $table = 'responsabilite_definitions';

    protected $fillable = ['code', 'libelle', 'description', 'niveau'];

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'code' => $arr['code'],
            'libelle' => $arr['libelle'],
            'description' => $arr['description'] ?? null,
            'niveau' => $arr['niveau'],
        ];
    }
}
