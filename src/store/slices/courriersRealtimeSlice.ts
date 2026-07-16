/**
 * Firestore désactivé : pas d’écoute en temps réel. Les courriers sont chargés via l’API Laravel (fetchCourriers).
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { store } from '../store';
import { setRealtimeSubscription } from './courriersSlice';

/** No-op : pas de souscription temps réel (données via API Laravel). */
export const startRealtimeCourriers = createAsyncThunk(
  'courriers/startRealtime',
  async (): Promise<() => void> => {
    const noop = () => {};
    store.dispatch(setRealtimeSubscription(noop));
    return noop;
  }
);
