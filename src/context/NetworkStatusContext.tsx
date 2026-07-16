import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

const getApiBaseUrl = (): string => {
  const url = typeof import.meta !== 'undefined' && import.meta.env?.VITE_LARAVEL_API_URL;
  if (url && typeof url === 'string') return url.replace(/\/$/, '');
  return '';
};

const checkApiReachable = async (baseUrl: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
};

interface NetworkStatusContextValue {
  /** true = connexion API Laravel OK (ou pas d’API configurée) ; false = API injoignable */
  online: boolean;
  /** true si le statut provient du ping API (VITE_LARAVEL_API_URL défini) */
  isApiStatus: boolean;
}

const NetworkStatusContext = createContext<NetworkStatusContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 120000;
const INITIAL_DELAY_MS = 2000;
const OFFLINE_THRESHOLD = 2; // 2 échecs consécutifs pour déclarer offline

export const NetworkStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const apiBaseUrl = getApiBaseUrl();
  const isApiConfigured = !!apiBaseUrl;

  const [online, setOnline] = useState<boolean>(() =>
    isApiConfigured ? true : (typeof navigator !== 'undefined' ? navigator.onLine : true)
  );
  const [isApiStatus, setIsApiStatus] = useState<boolean>(isApiConfigured);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef(0);

  useEffect(() => {
    if (!isApiConfigured) {
      const handleOnline = () => setOnline(true);
      const handleOffline = () => setOnline(false);
      setOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      const ok = await checkApiReachable(apiBaseUrl);
      if (!cancelled) {
        setIsApiStatus(true);
        if (ok) {
          // 1 succès → online immédiatement
          failCountRef.current = 0;
          setOnline(true);
        } else {
          // Incrémenter le compteur d'échecs
          failCountRef.current++;
          if (failCountRef.current >= OFFLINE_THRESHOLD) {
            setOnline(false);
          }
        }
      }
    };

    const t = setTimeout(() => {
      poll();
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [apiBaseUrl, isApiConfigured]);

  return (
    <NetworkStatusContext.Provider value={{ online, isApiStatus }}>
      {children}
    </NetworkStatusContext.Provider>
  );
};

export const useNetworkStatus = (): NetworkStatusContextValue => {
  const ctx = useContext(NetworkStatusContext);
  if (!ctx) throw new Error('useNetworkStatus must be used within NetworkStatusProvider');
  return ctx;
};
