<?php

namespace App\Providers;

use App\Models\User;
use App\Permissions\Permission;
use App\Services\PermissionService;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * Register any authentication / authorization services.
     * Définit une Gate par permission (nom kebab-case) basée sur le rôle utilisateur.
     */
    public function boot(): void
    {
        $permissionService = $this->app->make(PermissionService::class);

        foreach (Permission::all() as $permission) {
            $gateName = Permission::toGateName($permission);
            Gate::define($gateName, function (User $user) use ($permission, $permissionService) {
                return $permissionService->hasPermission($user, $permission);
            });
        }
    }
}
