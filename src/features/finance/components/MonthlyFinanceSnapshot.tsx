// Lectura rápida del mes (flujo, gastos, estructura, ritmo) + mini-tarjetas.
// Extraído de FinanceTracker.tsx (Fase B del refactor).
import { buildFinancialInsights } from '../finance.insights';
import { getFinanceCategoryClarityStats } from '../finance.categories';
import { formatFinanceMonth } from '../finance.format';
import { getAccountTypeLabel } from '../finance.accountForm';
import type { MonthlyAccountUsage } from '../finance.accountSummary';

export function MonthlyFinanceSnapshot({
  insights,
  clarityStats,
  reviewCount,
  accountUsage,
}: {
  insights: ReturnType<typeof buildFinancialInsights>;
  clarityStats: ReturnType<typeof getFinanceCategoryClarityStats>;
  reviewCount: number;
  accountUsage: MonthlyAccountUsage | null;
}) {
  const dashboard = insights.periodDashboard;
  const profile = insights.monthlyProfile;
  const primaryCurrency = dashboard.byCurrency[0] || null;
  const topCategory = dashboard.topCategories[0] || null;
  const topCategoryDelta = dashboard.categoryDeltas[0] || null;
  const topPriority = insights.actionPriorities[0] || null;
  const expenseChange = insights.projection.expenseChangeRealVsPreviousMonth;
  const incomeChange = insights.projection.incomeChangeRealVsPreviousMonth;
  const monthPace = dashboard.monthPace;
  const fixedLike = profile.fixedDeclared + profile.recurringDetected;
  const fixedShare = profile.totalExpenses > 0 ? Math.round((fixedLike / profile.totalExpenses) * 100) : 0;
  const hasData = Boolean(primaryCurrency || profile.totalExpenses || dashboard.topCategories.length);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <div className="rounded-[2rem] border border-neutral-200 bg-neutral-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Este mes</p>
            <h3 className="mt-1 text-2xl font-black tracking-tight">
              {dashboard.month ? formatFinanceMonth(dashboard.month) : 'Todavia sin lectura mensual'}
            </h3>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-950">
            {primaryCurrency?.currency || profile.currency || 'ARS'}
          </span>
        </div>

        {hasData ? (
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <MonthlySnapshotStat
              label="Flujo"
              value={primaryCurrency ? primaryCurrency.net : 0}
              currency={primaryCurrency?.currency || profile.currency}
              tone={(primaryCurrency?.net || 0) >= 0 ? 'positive' : 'negative'}
            />
            <MonthlySnapshotStat
              label="Ingresos"
              value={primaryCurrency ? primaryCurrency.income : 0}
              currency={primaryCurrency?.currency || profile.currency}
              tone="neutral"
            />
            <MonthlySnapshotStat
              label="Gastos"
              value={primaryCurrency ? primaryCurrency.expenses : profile.totalExpenses}
              currency={primaryCurrency?.currency || profile.currency}
              tone="negative"
            />
            <MonthlySnapshotStat
              label="Fijo/recurrente"
              value={fixedShare}
              suffix="%"
              tone={fixedShare >= 65 ? 'warning' : 'neutral'}
            />
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-sm font-bold leading-6 text-white/60">
              Cuando cargues movimientos, aca va a aparecer la lectura rapida del mes: flujo, gastos, ingresos y estructura fija.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MonthlySnapshotMiniCard
            label="Mayor rubro"
            value={topCategory ? topCategory.category : 'Sin categoria dominante'}
            detail={topCategory ? `${topCategory.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${topCategory.currency} · ${Math.round(topCategory.share * 100)}%` : 'Falta mas data del mes.'}
          />
          <MonthlySnapshotMiniCard
            label="Cuenta usada"
            value={accountUsage ? accountUsage.accountName : 'Sin cuenta dominante'}
            detail={accountUsage ? formatAccountUsageDetail(accountUsage) : 'Cuando haya gastos con cuenta, VEO muestra por donde salio mas plata.'}
          />
          <MonthlySnapshotMiniCard
            label="Mayor cambio"
            value={topCategoryDelta ? topCategoryDelta.category : 'Sin comparacion'}
            detail={topCategoryDelta ? formatCategoryDeltaDetail(topCategoryDelta) : 'Con dos meses comparables, VEO muestra que rubro cambio mas.'}
          />
          <MonthlySnapshotMiniCard
            label="Proxima accion"
            value={topPriority ? topPriority.title : 'Seguir cargando'}
            detail={topPriority ? topPriority.detail : 'La prioridad aparece cuando VEO detecta una tension concreta.'}
          />
          <MonthlySnapshotMiniCard
            label="Cierre proyectado"
            value={monthPace ? `${monthPace.projectedExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${monthPace.currency}` : 'Sin proyeccion'}
            detail={monthPace ? monthPace.read : 'Con movimientos del mes, VEO estima como cerraria si mantenes el ritmo.'}
          />
          <MonthlySnapshotMiniCard
            label="Promedio diario"
            value={monthPace ? `${monthPace.dailyExpenseAverage.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${monthPace.currency}` : 'Sin ritmo'}
            detail={monthPace ? `Dia ${monthPace.elapsedDay} de ${monthPace.daysInMonth}. Quedan ${monthPace.remainingDays} dia(s) para cerrar el mes.` : 'Con gastos del mes, VEO calcula el ritmo diario real.'}
          />
          <MonthlySnapshotMiniCard
            label="Gasto real"
            value={formatRealChangeValue(expenseChange)}
            detail={expenseChange?.read || 'Con mas historial e IPC, VEO compara gasto nominal contra gasto real.'}
          />
          <MonthlySnapshotMiniCard
            label="Ingreso real"
            value={formatRealChangeValue(incomeChange)}
            detail={incomeChange?.read || 'Sirve para ver si tus ingresos suben de verdad o solo nominalmente.'}
          />
          <MonthlySnapshotMiniCard
            label="Calidad"
            value={`${Math.round((1 - (clarityStats.share || 0)) * 100)}% claro`}
            detail={clarityStats.count ? `${clarityStats.count} gasto(s) siguen flojos o inferidos.` : 'Categorias limpias por ahora.'}
          />
          <MonthlySnapshotMiniCard
            label="Pendientes"
            value={String(reviewCount)}
            detail={reviewCount ? 'Hay movimientos para revisar cuando tengas un rato.' : 'Sin movimientos esperando revision.'}
          />
        </div>
      </div>
    </section>
  );
}

function formatRealChangeValue(change?: ReturnType<typeof buildFinancialInsights>['projection']['expenseChangeRealVsPreviousMonth']) {
  if (!change || change.interpretation === 'insufficient_data' || change.realChangeRate == null) return 'Sin data';
  if (change.interpretation === 'stable') return 'Casi igual';
  const percent = Math.round(change.realChangeRate * 100);
  return `${percent > 0 ? '+' : ''}${percent}% real`;
}

function formatCategoryDeltaDetail(delta: ReturnType<typeof buildFinancialInsights>['periodDashboard']['categoryDeltas'][number]) {
  const direction = delta.direction === 'up' ? 'subio' : delta.direction === 'down' ? 'bajo' : 'quedo igual';
  const amount = Math.abs(delta.delta).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const rate = delta.deltaRate == null ? '' : ` (${delta.deltaRate > 0 ? '+' : ''}${Math.round(delta.deltaRate * 100)}%)`;
  return `${direction} ${amount} ${delta.currency}${rate} contra el mes anterior.`;
}

function formatAccountUsageDetail(accountUsage: MonthlyAccountUsage) {
  const amount = accountUsage.amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const share = Math.round(accountUsage.share * 100);
  const type = getAccountTypeLabel(accountUsage.accountType).toLowerCase();
  return `${amount} ${accountUsage.currency} · ${share}% del gasto del mes · ${type}.`;
}

function MonthlySnapshotStat({
  label,
  value,
  currency,
  suffix = '',
  tone,
}: {
  label: string;
  value: number;
  currency?: string;
  suffix?: string;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
}) {
  const toneClass = {
    positive: 'text-emerald-300',
    negative: 'text-rose-300',
    warning: 'text-amber-300',
    neutral: 'text-white',
  }[tone];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/35">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-tight ${toneClass}`}>
        {suffix ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : `${value >= 0 && tone === 'positive' ? '+' : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        {suffix || (currency ? <span className="ml-1 text-[10px] font-black text-white/35">{currency}</span> : null)}
      </p>
    </div>
  );
}

function MonthlySnapshotMiniCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 truncate text-lg font-black text-neutral-950">{value}</p>
      <p className="mt-2 line-clamp-3 text-xs font-bold leading-5 text-neutral-500">{detail}</p>
    </div>
  );
}
