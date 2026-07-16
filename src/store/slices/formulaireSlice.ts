import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { TypeCourrier, SensCourrier } from '../../types';
import { ExtraFieldsBySensAndType } from '../../services/formulaireCourrierService';
import { laravelApiService } from '../../services/laravelApiService';

const FORMULAIRE_STORAGE_KEY = 'courrier_extra_fields_config';

interface FormulaireState {
  config: ExtraFieldsBySensAndType;
  loading: boolean;
  error: string | null;
}

const getDefaultByType = () => ({ [TypeCourrier.EXTERNE]: [], [TypeCourrier.INTERNE]: [] });
const getDefaultConfig = (): ExtraFieldsBySensAndType => ({
  [SensCourrier.ENTRANT]: getDefaultByType(),
  [SensCourrier.SORTANT]: getDefaultByType(),
});

const initialState: FormulaireState = {
  config: getDefaultConfig(),
  loading: false,
  error: null,
};

/** Chargement : API Laravel GET /api/config/formulaire si configurée (paramétrage = Laravel uniquement, pas Firebase), sinon localStorage. */
export const fetchFormulaireConfig = createAsyncThunk('formulaire/fetchConfig', async (): Promise<ExtraFieldsBySensAndType> => {
  if (laravelApiService.isConfigured()) {
    const data = await laravelApiService.getConfigFormulaire();
    if (data && typeof data === 'object' && (data.ENTRANT != null || data.SORTANT != null)) {
      const config = data as ExtraFieldsBySensAndType;
      if (typeof localStorage !== 'undefined') localStorage.setItem(FORMULAIRE_STORAGE_KEY, JSON.stringify(config));
      return config;
    }
    return initialState.config;
  }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FORMULAIRE_STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw) as ExtraFieldsBySensAndType;
  } catch {}
  return initialState.config;
});

/** Sauvegarde : API Laravel PUT /api/config/formulaire si configurée (pas Firebase), puis cache localStorage. */
export const saveFormulaireConfig = createAsyncThunk(
  'formulaire/saveConfig',
  async (config: ExtraFieldsBySensAndType): Promise<ExtraFieldsBySensAndType> => {
    if (laravelApiService.isConfigured()) {
      await laravelApiService.saveConfigFormulaire(config as unknown as Record<string, unknown>);
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem(FORMULAIRE_STORAGE_KEY, JSON.stringify(config));
    return config;
  }
);

const formulaireSlice = createSlice({
  name: 'formulaire',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFormulaireConfig.fulfilled, (state, action) => {
        state.config = action.payload;
      })
      .addCase(saveFormulaireConfig.fulfilled, (state, action) => {
        state.config = action.payload;
      });
  },
});

export default formulaireSlice.reducer;
