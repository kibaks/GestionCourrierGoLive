<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class RoleDefinition extends Model
{
    use HasUuids;

    protected $table = 'roles';

    protected $fillable = ['nom', 'code', 'description', 'permissions'];

    protected $casts = [
        'permissions' => 'array',
    ];

    public function toArray(): array
    {
        $arr = parent::toArray();
        return [
            'id' => $arr['id'],
            'nom' => $arr['nom'],
            'code' => $arr['code'],
            'description' => $arr['description'] ?? null,
            'permissions' => $arr['permissions'] ?? [],
            'dateCreation' => $this->created_at?->format('c'),
            'dateModification' => $this->updated_at?->format('c'),
        ];
    }
}
