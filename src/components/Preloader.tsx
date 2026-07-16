import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileAlt } from '@fortawesome/free-solid-svg-icons';

const Preloader: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 1100; // Légèrement avant la disparition (1200ms dans main)
    const start = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(100, (elapsed / duration) * 100);
      setProgress(p);
      if (p < 100) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[50000] flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-secondary-800"
      style={{ isolation: 'isolate' }}
    >
      <style>
        {`
          @keyframes floaty {
            0% { transform: translateY(0px); opacity: 1; }
            50% { transform: translateY(-8px); opacity: 0.85; }
            100% { transform: translateY(0px); opacity: 1; }
          }
          @keyframes pulseRing {
            0% { transform: scale(1); opacity: 0.35; }
            70% { transform: scale(1.35); opacity: 0; }
            100% { opacity: 0; }
          }
          @keyframes progressGlow {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}
      </style>
      <div className="relative flex flex-col items-center gap-4 text-white w-full max-w-sm px-8">
        <div className="absolute -inset-16 bg-gradient-to-r from-white/10 via-white/5 to-transparent blur-3xl opacity-60" />
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 rounded-3xl bg-white/8 backdrop-blur-sm border border-white/10 shadow-2xl shadow-black/30" />
          <div className="absolute inset-2 rounded-2xl bg-gradient-to-br from-accent-400/30 to-accent-600/30 blur-sm" />
          <div className="absolute inset-0 rounded-3xl border-2 border-white/25 animate-[pulseRing_1.6s_ease-out_infinite]" />
          <div className="absolute inset-0 rounded-3xl border border-white/10 animate-[pulseRing_2s_ease-out_infinite]" style={{ animationDelay: '0.2s' }} />
          <FontAwesomeIcon
            icon={faFileAlt}
            className="w-10 h-10 text-white relative z-10"
            style={{ animation: 'floaty 1.8s ease-in-out infinite' }}
          />
        </div>
        <div className="text-center space-y-1 relative z-10">
          <p className="text-sm uppercase tracking-[0.2em] text-white/70">Chargement</p>
          <p className="text-xl font-semibold">GestionCourriers</p>
        </div>

        {/* Barre de progression */}
        <div className="relative z-10 w-full mt-2">
          <div
            className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-white/90 to-white transition-[width] duration-150 ease-out shadow-lg"
              style={{
                width: `${progress}%`,
                boxShadow: '0 0 12px rgba(255,255,255,0.4)',
              }}
            />
          </div>
          <p className="text-xs text-white/60 mt-1.5 text-center tabular-nums">
            {Math.round(progress)} %
          </p>
        </div>
      </div>
    </div>
  );
};

export default Preloader;
