import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { Utilisateur } from '../../types';
import { laravelApiService } from '../../services/laravelApiService';

interface UtilisateursState {
  items: Utilisateur[];
  loading: boolean;
  error: string | null;
}

const initialState: UtilisateursState = {
  items: [],
  loading: false,
  error: null,
};

/** Chargement des utilisateurs : uniquement Laravel (Firestore désactivé). Si pas d’API ou pas d’endpoint liste, retourne []. */
export const fetchUtilisateurs = createAsyncThunk(
  'utilisateurs/fetchUtilisateurs',
  async (): Promise<Utilisateur[]> => {
    if (!laravelApiService.isConfigured()) return [];
    try {
      const me = await laravelApiService.getMe();
      if (me) return [me];
    } catch {
      // pas d’endpoint liste utilisateurs
    }
    return [];
  }
);

const utilisateursSlice = createSlice({
  name: 'utilisateurs',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUtilisateurs.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUtilisateurs.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchUtilisateurs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Erreur inconnue';
      });
  },
});

export default utilisateursSlice.reducer;
