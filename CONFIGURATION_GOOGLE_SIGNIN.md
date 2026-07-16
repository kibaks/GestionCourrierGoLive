# Configuration Google Sign-In

## 📋 Variables d'environnement requises

Pour que la connexion Google fonctionne, vous devez configurer la variable d'environnement suivante dans votre fichier `.env` :

```env
VITE_GOOGLE_CLIENT_ID=votre-client-id-google.apps.googleusercontent.com
```

## 🔧 Comment obtenir votre Google Client ID

### Étape 1 : Créer un projet dans Google Cloud Console

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un nouveau projet ou sélectionnez un projet existant
3. Activez l'API "Google Identity Services" pour votre projet

### Étape 2 : Créer les identifiants OAuth 2.0

1. Dans Google Cloud Console, allez dans **APIs & Services** > **Credentials**
2. Cliquez sur **Create Credentials** > **OAuth client ID**
3. Si c'est la première fois, configurez l'écran de consentement OAuth :
   - Choisissez **External** (pour les tests) ou **Internal** (pour les comptes Google Workspace)
   - Remplissez les informations requises
   - Ajoutez votre email comme utilisateur de test
4. Pour le type d'application, choisissez **Web application**
5. Configurez les **Authorized JavaScript origins** :
   - `http://localhost:5173` (pour le développement)
   - `https://votre-domaine.com` (pour la production)
6. Configurez les **Authorized redirect URIs** :
   - `http://localhost:5173` (pour le développement)
   - `https://votre-domaine.com` (pour la production)
7. Cliquez sur **Create**
8. Copiez le **Client ID** (il ressemble à : `123456789-abcdefghijklmnop.apps.googleusercontent.com`)

### Étape 3 : Configurer dans votre projet

1. Créez ou modifiez le fichier `.env` à la racine de votre projet
2. Ajoutez la ligne :
   ```env
   VITE_GOOGLE_CLIENT_ID=votre-client-id-google.apps.googleusercontent.com
   ```
3. Redémarrez le serveur de développement

## ⚠️ Important

- Le **Client ID** doit être celui d'une application **Web application**, pas d'une application mobile
- Les **Authorized JavaScript origins** doivent correspondre exactement à l'URL de votre application
- Pour la production, n'oubliez pas d'ajouter votre domaine dans les origines autorisées
- Le fichier `.env` ne doit **JAMAIS** être commité dans Git (il devrait être dans `.gitignore`)

## 🔍 Vérification

Après configuration, vérifiez dans la console du navigateur :
- ✅ Si vous voyez "✅ Google Sign-In initialisé", la configuration est correcte
- ❌ Si vous voyez "❌ VITE_GOOGLE_CLIENT_ID non configuré", vérifiez votre fichier `.env`
- ❌ Si vous voyez des erreurs de domaine, vérifiez les **Authorized JavaScript origins** dans Google Cloud Console

## 🐛 Dépannage

### Erreur : "Configuration Google manquante"
- Vérifiez que `VITE_GOOGLE_CLIENT_ID` est bien défini dans `.env`
- Redémarrez le serveur de développement après modification de `.env`

### Erreur : "Erreur 400: redirect_uri_mismatch"
- Vérifiez que l'URL de votre application est bien dans les **Authorized JavaScript origins**
- L'URL doit correspondre exactement (http vs https, avec ou sans port)

### Erreur : "Erreur 403: access_denied"
- Vérifiez que l'API Google Identity Services est activée dans Google Cloud Console
- Vérifiez que votre email est dans la liste des utilisateurs de test (si l'écran de consentement est en mode test)


