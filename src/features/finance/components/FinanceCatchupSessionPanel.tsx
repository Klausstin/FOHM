// Panel de "puesta al día": sugiere minutos, mide la sesión y guarda el ritmo
// en localStorage. Extraído de FinanceTracker.tsx (Fase B del refactor).
import { useState, useMemo } from 'react';
import { estimateFinanceCatchupMinutes } from '../finance.helpers';

function readCatchupSessions(storageKey: string) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ReviewMiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-4 py-3">
      <p className="text-xl font-black text-neutral-950">{value}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
    </div>
  );
}

export function FinanceCatchupSessionPanel({
  userId,
  pendingCount,
  daysSinceLastUpdate,
  hasNoMovements,
  onOpenCatchupWizard,
}: {
  userId: string;
  pendingCount: number;
  daysSinceLastUpdate: number | null;
  hasNoMovements: boolean;
  onOpenCatchupWizard: () => void;
}) {
  const storageKey = `veo.financeCatchupSessions.${userId}`;
  const [sessions, setSessions] = useState<any[]>(() => readCatchupSessions(storageKey));
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const averageMinutesPerItem = useMemo(() => {
    const usable = sessions.filter(session => session.pendingCount > 0 && session.actualMinutes > 0);
    if (usable.length === 0) return null;
    const average = usable.reduce((sum, session) => sum + (session.actualMinutes / session.pendingCount), 0) / usable.length;
    return Math.max(1, Math.min(15, average));
  }, [sessions]);

  const suggestedMinutes = estimateFinanceCatchupMinutes({
    pendingReviewCount: pendingCount,
    daysSinceLastUpdate,
    averageMinutesPerItem,
  });

  const shouldShow = hasNoMovements || pendingCount > 0 || (daysSinceLastUpdate !== null && daysSinceLastUpdate >= 10);

  const ensureSessionStarted = () => {
    setSessionStartedAt(prev => prev || Date.now());
  };

  const finishSession = () => {
    if (!sessionStartedAt) return;
    const actualMinutes = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000));
    const nextSession = {
      id: `finance-catchup-${Date.now()}`,
      type: 'finance_update',
      estimatedMinutes: suggestedMinutes,
      actualMinutes,
      pendingCount,
      daysSinceLastUpdate,
      createdAt: new Date().toISOString(),
    };
    const nextSessions = [nextSession, ...sessions].slice(0, 12);
    setSessions(nextSessions);
    localStorage.setItem(storageKey, JSON.stringify(nextSessions));
    setSessionStartedAt(null);
  };

  if (!shouldShow) return null;

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Puesta al dia</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">{suggestedMinutes} min sugeridos</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <ReviewMiniStat label="Pendientes" value={pendingCount} />
            <ReviewMiniStat label="Dias" value={daysSinceLastUpdate ?? 0} />
            <ReviewMiniStat label="Ritmo" value={averageMinutesPerItem ? Math.round(averageMinutesPerItem) : 3} />
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-neutral-950 p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Acciones</p>
          <p className="mt-2 text-sm font-semibold leading-5 text-white/55">
            {sessionStartedAt ? 'VEO esta midiendo esta puesta al dia en segundo plano.' : 'Empeza por revisar pendientes o cargar un supuesto.'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={ensureSessionStarted}
              className="rounded-2xl bg-white px-3 py-3 text-xs font-black uppercase tracking-widest text-neutral-950 transition hover:bg-neutral-100"
            >
              Revisar
            </button>
            <button
              type="button"
              onClick={finishSession}
              disabled={!sessionStartedAt}
              className="rounded-2xl border border-white/10 px-3 py-3 text-xs font-black uppercase tracking-widest text-white/60 transition hover:bg-white/10 disabled:opacity-30"
            >
              Listo
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              ensureSessionStarted();
              onOpenCatchupWizard();
            }}
            className="mt-2 w-full rounded-2xl border border-white/10 px-3 py-3 text-xs font-black uppercase tracking-widest text-white/60 transition hover:bg-white/10"
          >
            Cargar supuesto
          </button>
        </div>
      </div>
    </section>
  );
}
