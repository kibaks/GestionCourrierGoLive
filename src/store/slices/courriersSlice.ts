import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Courrier } from '../../types';
import { storageSyncService } from '../../services/storageSyncService';

/** Souscription temps réel (plus de Firestore : no-op). */
type RealtimeUnsubscribe = (() => void) | null;

interface CourriersState {
  items: Courrier[];
  loading: boolean;
  error: string | null;
  lastFetch: number | null;
  realtimeSubscription: RealtimeUnsubscribe;
}

const initialState: CourriersState = {
  items: [],
  loading: false,
  error: null,
  lastFetch: null,
  realtimeSubscription: null,
};

// Les thunks délèguent à storageSyncService. Insertion, lecture, mise à jour, suppression : API Laravel uniquement (pas Firestore).

const DATE_FIELDS = ['dateReception', 'dateEnregistrement', 'createdAt', 'updatedAt'] as const;

function serializeCourrier(c: Courrier): Courrier {
  const out = { ...c } as Record<string, unknown>;
  for (const key of DATE_FIELDS) {
    if (out[key] instanceof Date) out[key] = (out[key] as Date).toISOString();
  }
  return out as unknown as Courrier;
}

export interface FetchCourriersParams {
  userId?: string;
  serverFilters?: {
    direction?: string;
    service?: string;
    sousService?: string;
    bureau?: string;
    role?: string;
  };
}

export const fetchCourriers = createAsyncThunk(
  'courriers/fetchCourriers',
  async (params?: FetchCourriersParams | string) => {
    // Rétrocompatibilité : accepte string (userId seul) ou objet FetchCourriersParams
    const userId = typeof params === 'string' ? params : params?.userId;
    const serverFilters = typeof params === 'object' && params !== null ? params.serverFilters : undefined;
    const result = await storageSyncService.fetchCourriers(userId, true, serverFilters);
    return result.map(serializeCourrier);
  }
);

export const createCourrier = createAsyncThunk(
  'courriers/createCourrier',
  async (courrier: Omit<Courrier, 'id' | 'numero' | 'dateEnregistrement' | 'createdAt' | 'updatedAt'>) => {
    const result = await storageSyncService.createCourrier(courrier);
    return serializeCourrier(result);
  }
);

export const createCourriersBulk = createAsyncThunk(
  'courriers/createCourriersBulk',
  async (courriers: Array<Omit<Courrier, 'id' | 'numero' | 'dateEnregistrement' | 'statut' | 'createdAt' | 'updatedAt'> & { numero?: string }>) => {
    const result = await storageSyncService.createCourriersBulk(courriers);
    return result.map(serializeCourrier);
  }
);

export const updateCourrier = createAsyncThunk(
  'courriers/updateCourrier',
  async ({ id, updates }: { id: string; updates: Partial<Courrier> }) => {
    await storageSyncService.updateCourrier(id, updates);
    return { id, updates };
  }
);

export const deleteCourrier = createAsyncThunk(
  'courriers/deleteCourrier',
  async (id: string) => {
    await storageSyncService.deleteCourrier(id);
    return id;
  }
);

const courriersSlice = createSlice({
  name: 'courriers',
  initialState,
  reducers: {
    setCourriers: (state, action: PayloadAction<Courrier[]>) => {
      state.items = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setRealtimeSubscription: (state, action: PayloadAction<RealtimeUnsubscribe>) => {
      // Nettoyer l'ancienne souscription si elle existe
      if (state.realtimeSubscription) {
        state.realtimeSubscription();
      }
      state.realtimeSubscription = action.payload;
    },
    unsubscribeRealtime: (state) => {
      if (state.realtimeSubscription) {
        state.realtimeSubscription();
        state.realtimeSubscription = null;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch
      .addCase(fetchCourriers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCourriers.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        state.lastFetch = Date.now();
      })
      .addCase(fetchCourriers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Erreur inconnue';
      })
      // Create
      .addCase(createCourrier.pending, (_state) => {
        // Ne pas passer loading=true ici pour éviter les re-renders globaux en mode liste
      })
      .addCase(createCourrier.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(createCourrier.rejected, (state, action) => {
        state.error = action.error.message || 'Erreur inconnue';
      })
      // Create bulk
      .addCase(createCourriersBulk.pending, (_state) => {
        // Ne pas passer loading=true ici pour éviter les re-renders globaux en mode liste
      })
      .addCase(createCourriersBulk.fulfilled, (state, action) => {
        state.items.unshift(...action.payload);
      })
      .addCase(createCourriersBulk.rejected, (state, action) => {
        state.error = action.error.message || 'Erreur inconnue';
      })
      // Update
      .addCase(updateCourrier.pending, (_state) => {
        // Ne pas bloquer le loading global
      })
      .addCase(updateCourrier.fulfilled, (state, action) => {
        const index = state.items.findIndex(c => c.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = { ...state.items[index], ...action.payload.updates };
        }
      })
      .addCase(updateCourrier.rejected, (state, action) => {
        state.error = action.error.message || 'Erreur inconnue';
      })
      // Delete
      .addCase(deleteCourrier.pending, (_state) => {
        // Ne pas bloquer le loading global
      })
      .addCase(deleteCourrier.fulfilled, (state, action) => {
        state.items = state.items.filter(c => c.id !== action.payload);
      })
      .addCase(deleteCourrier.rejected, (state, action) => {
        state.error = action.error.message || 'Erreur inconnue';
      });
  },
});

export const { setCourriers, clearError, setRealtimeSubscription, unsubscribeRealtime } = courriersSlice.actions;
export default courriersSlice.reducer;

