<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Tymon\JWTAuth\Contracts\JWTSubject;

/**
 * Utilisateur avec rôles et permissions (aligné Firebase / Firestore).
 * Rôles : SUPER_ADMIN, DIRECTEUR_GENERAL, SECRETAIRE, DIRECTEUR, CHEF_SERVICE, AGENT.
 */
class User extends Authenticatable implements JWTSubject
{
    use HasUuids, HasFactory, Notifiable;

    protected $table = 'users';

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'direction',
        'service',
        'entite_id',
        'actif',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'actif' => 'boolean',
    ];

    public function getJWTIdentifier(): mixed
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims(): array
    {
        return [
            'role' => $this->role,
            'direction' => $this->direction,
            'service' => $this->service,
        ];
    }

    public function assignationsRecues(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Assignation::class, 'assigne_a', 'id');
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === 'SUPER_ADMIN';
    }

    public function isDirecteurGeneral(): bool
    {
        return $this->role === 'DIRECTEUR_GENERAL';
    }

    public function isSecretaire(): bool
    {
        return $this->role === 'SECRETAIRE';
    }

    public function isDirecteur(): bool
    {
        return $this->role === 'DIRECTEUR';
    }

    public function isChefService(): bool
    {
        return $this->role === 'CHEF_SERVICE';
    }

    public function isAgent(): bool
    {
        return $this->role === 'AGENT';
    }

    /** Voir tous les courriers (comme Firebase) */
    public function canSeeAllCourriers(): bool
    {
        return $this->isSuperAdmin() || $this->isDirecteurGeneral() || $this->isSecretaire();
    }
}
