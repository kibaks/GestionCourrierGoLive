<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class Handler extends ExceptionHandler
{
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            // Les exceptions sont déjà loguées par Laravel ; on peut ajouter un contexte supplémentaire si besoin
        });
    }

    /**
     * Enregistrer l'exception (log) pour les routes API (sauf validation/auth, déjà gérées).
     */
    public function report(Throwable $e): void
    {
        if (request()->is('api/*')
            && ! $e instanceof ValidationException
            && ! $e instanceof AuthenticationException
        ) {
            Log::error('API Exception', [
                'message' => $e->getMessage(),
                'exception' => get_class($e),
                'url' => request()->fullUrl(),
                'method' => request()->method(),
            ]);
        }
        parent::report($e);
    }

    /**
     * Pour les routes API, toujours renvoyer du JSON (même sans Accept: application/json).
     */
    protected function shouldReturnJson($request, Throwable $e): bool
    {
        if ($request->is('api/*')) {
            return true;
        }
        return parent::shouldReturnJson($request, $e);
    }

    /**
     * Réponse JSON pour les routes API : message clair + détails en debug.
     * Évite les erreurs de rendu HTML et permet de voir l'exception réelle.
     */
    public function render($request, Throwable $e)
    {
        if ($request->is('api/*')) {
            return $this->renderApiException($request, $e);
        }
        return parent::render($request, $e);
    }

    protected function renderApiException(Request $request, Throwable $e): JsonResponse
    {
        $e = $this->mapException($e);
        $e = $this->prepareException($e);

        $statusCode = 500;
        if ($e instanceof HttpExceptionInterface) {
            $statusCode = $e->getStatusCode();
        }
        if ($e instanceof ValidationException) {
            $statusCode = 422;
        }
        if ($e instanceof AuthenticationException) {
            $statusCode = 401;
        }

        $message = $e->getMessage() ?: 'Erreur serveur';
        if ($e instanceof QueryException && (str_contains($message, 'Connection refused') || str_contains($message, '2002'))) {
            $statusCode = 503;
            $message = 'Base de données injoignable. Vérifiez que MySQL est démarré (ex. MAMP) sur le port configuré ('.(config('database.connections.mysql.port') ?? env('DB_PORT', 3306)).').';
        }

        $payload = [
            'message' => $message,
        ];

        if (config('app.debug')) {
            $payload['exception'] = get_class($e);
            $payload['file'] = $e->getFile();
            $payload['line'] = $e->getLine();
            $payload['trace'] = array_slice(explode("\n", $e->getTraceAsString()), 0, 15);
        }

        if ($e instanceof ValidationException) {
            $payload['errors'] = $e->errors();
        }

        $response = response()->json($payload, $statusCode);
        $this->addCorsHeaders($request, $response);
        return $response;
    }

    /**
     * Réponse 401 JSON pour les routes API quand l'utilisateur n'est pas authentifié.
     */
    protected function unauthenticated($request, AuthenticationException $exception)
    {
        if ($request->is('api/*')) {
            $response = response()->json(['message' => $exception->getMessage() ?: 'Non authentifié'], 401);
            $this->addCorsHeaders($request, $response);
            return $response;
        }
        return parent::unauthenticated($request, $exception);
    }

    private function addCorsHeaders(Request $request, $response)
    {
        $origin = $request->header('Origin');
        if ($origin && preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
            $response->header('Access-Control-Allow-Origin', $origin);
            $response->header('Access-Control-Allow-Credentials', 'true');
            $response->header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            $response->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
        }
        return $response;
    }
}
