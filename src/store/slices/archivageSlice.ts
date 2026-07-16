import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { LocalArchivage, Armoire, Etagere, BoiteArchive } from '../../types';

interface ArchivageState {
  locaux: LocalArchivage[];
  armoires: Armoire[];
  etageres: Etagere[];
  boites: BoiteArchive[];
  loading: boolean;
  error: string | null;
}

const initialState: ArchivageState = {
  locaux: [],
  armoires: [],
  etageres: [],
  boites: [],
  loading: false,
  error: null,
};

/** Firestore désactivé : pas d’API Laravel pour l’archivage pour l’instant, retourne []. */
export const fetchLocaux = createAsyncThunk('archivage/fetchLocaux', async (): Promise<LocalArchivage[]> => {
  return [];
});

/** Firestore désactivé : création locale en mémoire uniquement (pas de persistance). */
export const createLocal = createAsyncThunk(
  'archivage/createLocal',
  async (local: Omit<LocalArchivage, 'id' | 'dateCreation' | 'dateModification'>) => {
    const now = new Date();
    return { id: `local_${Date.now()}`, ...local, dateCreation: now, dateModification: now } as LocalArchivage;
  }
);

const archivageSlice = createSlice({
  name: 'archivage',
  initialState,
  reducers: {
    setLocaux: (state, action) => {
      state.locaux = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLocaux.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchLocaux.fulfilled, (state, action) => {
        state.loading = false;
        state.locaux = action.payload;
      })
      .addCase(createLocal.fulfilled, (state, action) => {
        state.locaux.push(action.payload);
      });
  },
});

export const { setLocaux } = archivageSlice.actions;
export default archivageSlice.reducer;
