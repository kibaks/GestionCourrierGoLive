import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { onSyncEvent, SyncEvent } from '../services/categorieCourrierService';

export type SyncOperation = 'folders' | 'mapping' | 'courriers' | 'upload' | 'notifications';

export interface SyncStatus {
  syncing: boolean;
  operation: SyncOperation | null;
  progress: number;
  message: string;
}

interface SyncStatusContextValue extends SyncStatus {
  startSync: (operation: SyncOperation, message?: string) => void;
  updateProgress: (progress: number, message?: string) => void;
  finishSync: (message?: string) => void;
  errorSync: (message: string) => void;
}

const DEFAULT_STATUS: SyncStatus = { syncing: false, operation: null, progress: 0, message: '' };
const SyncStatusContext = createContext<SyncStatusContextValue | undefined>(undefined);
const opMap: Record<string, SyncOperation> = { folders: 'folders', mapping: 'mapping', courriers: 'courriers', upload: 'upload', notifications: 'notifications' };

export const SyncStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>(DEFAULT_STATUS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSync = useCallback((operation: SyncOperation, message?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus({ syncing: true, operation, progress: 0, message: message || `Synchronisation ${operation}...` });
  }, []);

  const updateProgress = useCallback((progress: number, message?: string) => {
    setStatus(prev => ({ ...prev, progress: Math.min(100, Math.max(0, progress)), message: message || prev.message }));
  }, []);

  const finishSync = useCallback((message?: string) => {
    setStatus({ syncing: false, operation: null, progress: 100, message: message || '' });
    timerRef.current = setTimeout(() => setStatus(DEFAULT_STATUS), 3000);
  }, []);

  const errorSync = useCallback((message: string) => {
    setStatus({ syncing: false, operation: null, progress: 0, message });
    timerRef.current = setTimeout(() => setStatus(DEFAULT_STATUS), 5000);
  }, []);

  useEffect(() => {
    const unsub = onSyncEvent((event: SyncEvent) => {
      const op = opMap[event.operation] || 'folders';
      if (event.type === 'start') startSync(op, event.message);
      else if (event.type === 'progress') updateProgress(event.progress ?? 50, event.message);
      else if (event.type === 'finish') finishSync(event.message);
      else if (event.type === 'error') errorSync(event.message || 'Erreur de synchronisation');
    });
    return unsub;
  }, [startSync, updateProgress, finishSync, errorSync]);

  return (
    <SyncStatusContext.Provider value={{ ...status, startSync, updateProgress, finishSync, errorSync }}>
      {children}
    </SyncStatusContext.Provider>
  );
};

export const useSyncStatus = (): SyncStatusContextValue => {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) throw new Error('useSyncStatus must be used within SyncStatusProvider');
  return ctx;
};
