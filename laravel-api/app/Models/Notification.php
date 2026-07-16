<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Notification extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'notifications';

    protected $fillable = [
        'id',
        'userId',
        'type',
        'title',
        'message',
        'priority',
        'read',
        'readAt',
        'relatedId',
        'relatedType',
        'actionUrl',
        'metadata',
        'created_at', // Utiliser les noms Laravel
        'updated_at'
    ];

    protected $casts = [
        'read' => 'boolean',
        'readAt' => 'datetime',
        'metadata' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime'
    ];

    protected $keyType = 'string';
    public $incrementing = false;

    /**
     * Obtenir l'utilisateur destinataire de la notification
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }

    /**
     * Scope pour les notifications non lues
     */
    public function scopeUnread($query)
    {
        return $query->where('read', false);
    }

    /**
     * Scope pour les notifications par type
     */
    public function scopeByType($query, $type)
    {
        return $query->where('type', $type);
    }

    /**
     * Scope pour les notifications par priorité
     */
    public function scopeByPriority($query, $priority)
    {
        return $query->where('priority', $priority);
    }
}
