<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Métadonnée d'une prévisualisation de scan (suivi de propriété + expiration).
 * Le fichier physique vit dans storage/app/scan-preview/ (disque "local").
 */
class ScanPreview extends Model
{
    protected $fillable = [
        'preview_id',
        'created_by',
        'file_path',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
