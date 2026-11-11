# Google sign-in for the deployed Laravel API

Install on the current Laravel backend, preserving the deployed application's other changes:

1. Back up composer.json, composer.lock, routes/api.php and AuthController.php.
2. Install google/auth, firebase/php-jwt and phpseclib/phpseclib through Composer.
3. Copy GoogleAuthController.php to app/Http/Controllers/Api and google.php to config.
4. Change authenticatedResponse(User $user) from private to protected in AuthController.
5. Register POST auth/google with GoogleAuthController::class and throttle:5,1 beside the login route.
6. Set GOOGLE_CLIENT_ID to the same OAuth web client used by VITE_GOOGLE_CLIENT_ID; FRONTEND_URL is the exact authorized frontend origin.
7. Run config:cache and test-google.php before publishing the frontend.

Only existing active Gmail / verified Workspace accounts are admitted. Google verifies signatures, expiry and audience via its official library; issuer, verified email and origin are checked separately. Existing second-factor challenges remain required. No role comes from browser data and no account is created automatically.

Rollback: restore the backed-up controller/routes/config and the previous frontend deployment. Email/password sign-in remains available throughout.
