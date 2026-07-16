import { configureStore } from '@reduxjs/toolkit';
import courriersReducer from './slices/courriersSlice';
import utilisateursReducer from './slices/utilisateursSlice';
import archivageReducer from './slices/archivageSlice';
import formulaireReducer from './slices/formulaireSlice';
import entitesReducer from './slices/entitesSlice';
import authReducer from './slices/authSlice';

/**
 * Configuration du store Redux
 * 
 * Redux Toolkit inclut déjà Redux Thunk par défaut pour la gestion asynchrone.
 * Nous utilisons createAsyncThunk (de Redux Toolkit) qui est plus simple et moderne
 * que Redux Thunk classique, et qui gère automatiquement les états pending/fulfilled/rejected.
 * 
 * Pourquoi Redux Toolkit et createAsyncThunk plutôt que Redux Saga ou RTK Query ?
 * - Redux Toolkit est la solution recommandée officielle
 * - createAsyncThunk est simple et suffisant pour nos besoins
 * - RTK Query serait utile pour du cache/refetch automatique, mais nous gérons déjà cela avec Firestore
 * - Redux Saga serait trop complexe pour ce projet
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    courriers: courriersReducer,
    utilisateurs: utilisateursReducer,
    archivage: archivageReducer,
    formulaire: formulaireReducer,
    entites: entitesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignorer les Timestamps Firebase et Dates dans les actions
        ignoredActions: [
          'courriers/setCourriers',
          'courriers/fetchCourriers/fulfilled',
          'courriers/createCourrier/fulfilled',
          'archivage/setLocaux',
          'archivage/fetchLocaux/fulfilled',
        ],
        ignoredPaths: [
          'courriers.items',
          'archivage.locaux',
          'payload.dateReception',
          'payload.dateEnregistrement',
          'payload.createdAt',
          'payload.updatedAt',
        ],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

