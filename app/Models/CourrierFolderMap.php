<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CourrierFolderMap extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'courrier_folder_maps';

    protected $primaryKey = 'user_id';

    const UPDATED_AT = 'updated_at';

    const CREATED_AT = null;

    protected $fillable = ['user_id', 'map'];

    protected $casts = [
        'map' => 'array',
    ];
}
