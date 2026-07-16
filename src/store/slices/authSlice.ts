import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { firebaseAuthService, AuthUser } from '../../services/firebaseAuthService';
import { Utilisateur } from '../../types';

interface AuthState {
  user: AuthUser | null;
  customData: Utilisateur | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  customData: null,
  loading: true,
  error: null,
  isAuthenticated: false,
};

// Actions asynchrones
export const signIn = createAsyncThunk(
  'auth/signIn',
  async ({ email, password }: { email: string; password: string }) => {
    const user = await firebaseAuthService.signIn(email, password);
    return user;
  }
);

export const signUp = createAsyncThunk(
  'auth/signUp',
  async ({ 
    email, 
    password, 
    userData 
  }: { 
    email: string; 
    password: string; 
    userData: Omit<Utilisateur, 'id'> 
  }) => {
    const user = await firebaseAuthService.signUp(email, password, userData);
    return user;
  }
);

export const signOut = createAsyncThunk(
  'auth/signOut',
  async () => {
    await firebaseAuthService.signOut();
  }
);

export const loadUserData = createAsyncThunk(
  'auth/loadUserData',
  async (userId: string) => {
    const userData = await firebaseAuthService.getUserData(userId);
    return userData;
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<AuthUser | null>) => {
      state.user = action.payload;
      state.customData = action.payload?.customData || null;
      state.isAuthenticated = !!action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Sign In
      .addCase(signIn.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.customData = action.payload.customData || null;
        state.isAuthenticated = true;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Erreur de connexion';
        state.isAuthenticated = false;
      })
      // Sign Up
      .addCase(signUp.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(signUp.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.customData = action.payload.customData || null;
        state.isAuthenticated = true;
      })
      .addCase(signUp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Erreur lors de la création du compte';
        state.isAuthenticated = false;
      })
      // Sign Out
      .addCase(signOut.fulfilled, (state) => {
        state.user = null;
        state.customData = null;
        state.isAuthenticated = false;
      })
      // Load User Data
      .addCase(loadUserData.fulfilled, (state, action) => {
        if (action.payload) {
          state.customData = action.payload;
          if (state.user) {
            state.user.customData = action.payload;
          }
        }
      });
  },
});

export const { setUser, clearError } = authSlice.actions;
export default authSlice.reducer;

