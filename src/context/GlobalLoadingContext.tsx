import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

interface GlobalLoadingContextValue {
  count: number;
  start: () => void;
  stop: () => void;
  withLoading: <T>(fn: () => Promise<T>) => Promise<T>;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | undefined>(undefined);

// Barre de progression simulée : 0 → ~88% pendant le chargement, puis 100% à la fin
function LoadingProgressBar({ visible, done }: { visible: boolean; done: boolean }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!visible) {
      setProgress(0);
      return;
    }
    startRef.current = performance.now();
    setProgress(0);

    const duration = 2000; // 2s pour atteindre ~88%
    const target = 88;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - t) * (1 - t); // ease-out quad
      const p = Math.min(target, eased * target);
      setProgress(p);
      if (p < target && visible) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible]);

  useEffect(() => {
    if (done && visible) {
      setProgress(100);
    }
  }, [done, visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 h-1 bg-gray-900/20 z-[100000] overflow-hidden"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export const GlobalLoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [count, setCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const [progressDone, setProgressDone] = useState(false);

  const start = useCallback(() => {
    setCount(c => c + 1);
    setProgressDone(false);
  }, []);
  const stop = useCallback(() => {
    setCount(c => Math.max(0, c - 1));
    setProgressDone(true);
  }, []);

  const withLoading = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      start();
      try {
        return await fn();
      } finally {
        stop();
      }
    },
    [start, stop]
  );

  // Retarder l'affichage et garder la barre visible jusqu'à 100% à la fin
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (count > 0) {
      setProgressDone(false);
      timer = setTimeout(() => setVisible(true), 180);
    } else {
      setProgressDone(true);
      const t = setTimeout(() => {
        setVisible(false);
        setProgressDone(false);
      }, 450);
      return () => clearTimeout(t);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [count]);

  useRegisterGlobalLoading({ count, start, stop, withLoading });

  const barVisible = visible; // true pendant le chargement et encore 450ms après count=0
  const barDone = count === 0 && progressDone;

  return (
    <GlobalLoadingContext.Provider value={{ count, start, stop, withLoading }}>
      {children}
      {/* Barre de progression en haut de page — visible à chaque chargement */}
      <LoadingProgressBar visible={barVisible} done={barDone} />
      {visible && count > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(17,24,39,0.35)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <div className="flex flex-col items-center gap-3 text-white">
            <div className="w-12 h-12 rounded-full border-4 border-white/60 border-t-transparent animate-spin" />
            <span className="text-sm font-medium">Chargement...</span>
          </div>
        </div>
      )}
    </GlobalLoadingContext.Provider>
  );
};

export const useGlobalLoading = (): GlobalLoadingContextValue => {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    throw new Error('useGlobalLoading must be used within GlobalLoadingProvider');
  }
  return ctx;
};

// Helpers utilisables dans les services (hors React)
let externalStart: (() => void) | null = null;
let externalStop: (() => void) | null = null;
let externalWithLoading: (<T>(fn: () => Promise<T>) => Promise<T>) | null = null;

export const registerGlobalLoading = (api: GlobalLoadingContextValue) => {
  externalStart = api.start;
  externalStop = api.stop;
  externalWithLoading = api.withLoading;
};

// Auto-enregistrement quand le provider est monté
export const useRegisterGlobalLoading = (value: GlobalLoadingContextValue) => {
  React.useEffect(() => {
    registerGlobalLoading(value);
  }, [value]);
};

export const globalLoading = {
  start: () => externalStart?.(),
  stop: () => externalStop?.(),
  withLoading: async <T,>(fn: () => Promise<T>) =>
    externalWithLoading ? externalWithLoading(fn) : fn(),
};
