import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { EntiteOrganisationnelle } from '../../types';
import { laravelApiService } from '../../services/laravelApiService';

interface EntitesState {
  items: EntiteOrganisationnelle[];
  loading: boolean;
  error: string | null;
}

const initialState: EntitesState = {
  items: [],
  loading: false,
  error: null,
};

/** Chargement des entités organisationnelles via l'API Laravel (MySQL). */
export const fetchEntites = createAsyncThunk('entites/fetchEntites', async (_, { rejectWithValue }) => {
  if (!laravelApiService.isConfigured()) return [];
  try {
    return await laravelApiService.getEntitesOrganisationnelles();
  } catch (e) {
    console.warn('fetchEntites Laravel échoué:', e);
    return rejectWithValue((e as Error)?.message ?? 'Erreur chargement entités');
  }
});

const entitesSlice = createSlice({
  name: 'entites',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEntites.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEntites.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        state.error = null;
      })
      .addCase(fetchEntites.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) ?? action.error.message ?? null;
      });
  },
});

export default entitesSlice.reducer;
