import React from 'react';

const CourriersSkeleton: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header + stat cards skeleton */}
      <div className="rounded-2xl shadow-xl overflow-hidden">
        {/* Header band */}
        <div className="bg-gradient-to-r from-blue-500 via-blue-600 to-cyan-500 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-white/25 flex-shrink-0" />
            <div className="space-y-2">
              <div className="h-6 w-32 rounded-lg bg-white/30" />
              <div className="h-4 w-20 rounded bg-white/20" />
            </div>
          </div>
          {/* Stat mini-cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-6 w-8 rounded" />
                    <div className="skeleton h-3 w-14 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar skeleton */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="skeleton h-10 rounded-xl flex-1 max-w-[280px]" />
          <div className="skeleton h-10 w-24 rounded-xl" />
          <div className="skeleton h-10 w-32 rounded-xl" />
          <div className="ml-auto skeleton h-10 w-28 rounded-xl" />
          <div className="skeleton h-10 w-24 rounded-xl" />
        </div>
      </div>

      {/* List rows skeleton */}
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm"
            style={{ opacity: 1 - i * 0.12 }}
          >
            <div className="flex items-start gap-4">
              <div className="skeleton w-4 h-4 rounded mt-1 flex-shrink-0" />
              <div className="skeleton w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2.5 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="skeleton h-5 w-44 rounded" />
                  <div className="skeleton h-6 w-20 rounded-full flex-shrink-0" />
                </div>
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-20 rounded-full" />
                  <div className="skeleton h-5 w-24 rounded-full" />
                </div>
              </div>
              <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CourriersSkeleton;
