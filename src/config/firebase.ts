// IMPORTANT :
// Firebase est désormais optionnel. L'appli fonctionne avec l'API Laravel
// pour l'authentification, les courriers et les notifications.
// On garde la config uniquement pour les outils de migration / debug.
// Si VITE_FIREBASE_ENABLED !== 'true', aucun appel réseau Firebase n'est fait.

let initializeApp: any;
let getFirestore: any;
let getAuth: any;
let getStorage: any;

try {
  // Importer Firebase uniquement si le bundle le permet (évite les erreurs en environnement sans Firebase)
  // Ces imports restent tree-shakables et ne seront réellement utilisés que si firebaseEnabled === true.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const appModule = require('firebase/app');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const firestoreModule = require('firebase/firestore');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const authModule = require('firebase/auth');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const storageModule = require('firebase/storage');
  initializeApp = appModule.initializeApp;
  getFirestore = firestoreModule.getFirestore;
  getAuth = authModule.getAuth;
  getStorage = storageModule.getStorage;
} catch {
  // En environnement sans Firebase, on se contente de stubs
  initializeApp = () => ({});
  getFirestore = () => null;
  getAuth = () => null;
  getStorage = () => null;
}

// Configuration Firebase
// TODO: Remplacer par vos propres clés de configuration Firebase
const rawStorageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "your-project.appspot.com";
// Normaliser le bucket si mal saisi (ex: *.firebasestorage.app -> *.appspot.com)
const normalizedStorageBucket = rawStorageBucket.endsWith('.firebasestorage.app')
  ? rawStorageBucket.replace('.firebasestorage.app', '.appspot.com')
  : rawStorageBucket;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "your-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "your-project-id",
  storageBucket: normalizedStorageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "your-app-id"
};

// Vérifier la configuration Firebase
const checkFirebaseConfig = () => {
  const requiredVars = [
    { key: 'VITE_FIREBASE_API_KEY', value: firebaseConfig.apiKey },
    { key: 'VITE_FIREBASE_AUTH_DOMAIN', value: firebaseConfig.authDomain },
    { key: 'VITE_FIREBASE_PROJECT_ID', value: firebaseConfig.projectId },
    { key: 'VITE_FIREBASE_STORAGE_BUCKET', value: firebaseConfig.storageBucket },
    { key: 'VITE_FIREBASE_MESSAGING_SENDER_ID', value: firebaseConfig.messagingSenderId },
    { key: 'VITE_FIREBASE_APP_ID', value: firebaseConfig.appId },
  ];
  
  const missing = requiredVars.filter(v => 
    !v.value || 
    v.value.includes('your-') || 
    v.value === '123456789' || 
    v.value === 'your-app-id'
  );
  
  if (missing.length > 0) {
    console.warn('⚠️ Configuration Firebase incomplète. Variables manquantes:', missing.map(v => v.key));
  }
  
  return missing.length === 0;
};

// Vérifier la configuration au chargement
if (typeof window !== 'undefined') {
  checkFirebaseConfig();
}

// Activer ou non Firebase selon une variable d'environnement
const firebaseEnabled = import.meta.env.VITE_FIREBASE_ENABLED === 'true';

let app: any = null;
let db: any = null;
let auth: any = null;
let storage: any = null;

if (firebaseEnabled) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);
  console.info('[Firebase] Activé (VITE_FIREBASE_ENABLED=true).');
} else {
  // Mode sans Firebase : stubs inoffensifs pour éviter tout appel réseau Google
  app = {};
  db = null;
  auth = null;
  storage = null;
  if (typeof window !== 'undefined') {
    console.info('[Firebase] Désactivé (VITE_FIREBASE_ENABLED != "true"). Aucun appel réseau Firebase ne sera effectué.');
  }
}

export { db, auth, storage };
export default app;

