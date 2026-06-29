// Panel de lecturas/insights financieros del mes + proyección.
// Extraído de FinanceTracker.tsx (Fase B del refactor).
import { buildFinancialInsights } from '../finance.insights';
import { formatFinanceMonth, formatFinanceScope } from '../finance.format';

export function FinancialInsightsPanel({
  insights,
  onMarkRecurringAsFixed,
}: {
  insights: ReturnType<typeof buildFinancialInsights>;
  onMarkRecurringAsFixed: (insight: ReturnType<typeof buildFinancialInsights>['recurringDetected'][number]) => void;
}) {
  const topRecurring = insights.recurringDetected.slice(0, 4);
  const topFixed = insights.fixedDeclared.slice(0, 3);
  const topUnusual = insights.unusualExpenses.slice(0, 3);
  const topPriorities = insights.actionPriorities.slice(0, 4);
  const profile = insights.monthlyProfile;
  const dashboard = insights.periodDashboard;
  const fixedLike = profile.fixedDeclared + profile.recurringDetected;
  const fixedShare = profile.totalExpenses > 0 ? fixedLike / profile.totalExpenses : 0;
  const variableShare = profile.totalExpenses > 0 ? profile.variable / profile.totalExpenses : 0;

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Lectura del mes</p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">
              {dashboard.month ? formatFinanceMonth(dashboard.month) : 'Sin periodo suficiente'}
            </h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {dashboard.currency}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {dashboard.byCurrency.length > 0 ? dashboard.byCurrency.map(item => (
            <PeriodCurrencyCard key={item.currency} item={item} />
          )) : (
            <div className="rounded-2xl bg-neutral-50 p-4 md:col-span-3">
              <p className="text-sm font-bold leading-6 text-neutral-500">Todavia falta cargar movimientos para leer el periodo.</p>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-[1.5rem] border border-neutral-100 bg-neutral-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Luz</p>
            <p className="mt-2 text-sm font-bold leading-6 text-neutral-800">{insights.luzRead}</p>
          </div>
          <div className="rounded-[1.5rem] border border-neutral-100 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Estructura</p>
            <p className="mt-2 text-3xl font-black text-neutral-950">{Math.round(fixedShare * 100)}%</p>
            <p className="mt-1 text-xs font-bold text-neutral-500">fijo o recurrente</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-neutral-950" style={{ width: `${Math.min(100, Math.round(fixedShare * 100))}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <ExpenseProfileStat label="Fijo declarado" value={profile.fixedDeclared} currency={profile.currency} />
          <ExpenseProfileStat label="Recurrente detectado" value={profile.recurringDetected} currency={profile.currency} />
          <ExpenseProfileStat label={`Variable (${Math.round(variableShare * 100)}%)`} value={profile.variable} currency={profile.currency} />
          <ExpenseProfileStat label="Extraordinario" value={profile.unusual} currency={profile.currency} />
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-neutral-100 bg-neutral-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Que corregir primero</p>
            <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-400 border border-neutral-100">
              Priorizado
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {topPriorities.map(priority => (
              <FinancePriorityCard key={priority.id} priority={priority} />
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <InsightList
            title="Categorias que mas pesaron"
            empty="Sin gastos del periodo"
            items={dashboard.topCategories.map(item => ({
              title: item.category,
              detail: `${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${item.currency} - ${Math.round(item.share * 100)}% del gasto`,
            }))}
          />
          <div className="rounded-[1.5rem] border border-neutral-100 p-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Nominal vs real</p>
            <div className="space-y-2">
              {[dashboard.realExpenseRead, dashboard.realIncomeRead].filter(Boolean).map(read => (
                <p key={read} className="rounded-2xl bg-neutral-50 p-3 text-sm font-bold leading-6 text-neutral-700">{read}</p>
              ))}
              {!dashboard.realExpenseRead && !dashboard.realIncomeRead && (
                <p className="rounded-2xl bg-neutral-50 p-3 text-sm font-bold leading-6 text-neutral-400">
                  Cuando haya historial e IPC disponible, VEO va a separar subas nominales de subas reales.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <InsightList
            title="Para quien"
            empty="Sin beneficiarios claros"
            items={dashboard.byBeneficiary.map(item => ({
              title: item.label,
              detail: `${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${item.currency} - ${Math.round(item.share * 100)}% del gasto`,
            }))}
          />
          <InsightList
            title="Ambito familiar"
            empty="Sin ambito claro"
            items={dashboard.byScope.map(item => ({
              title: formatFinanceScope(item.scope),
              detail: `${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${item.currency} - ${Math.round(item.share * 100)}% del gasto`,
            }))}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <InsightList
            title="Fijos declarados"
            empty="Sin fijos marcados"
            items={topFixed.map(item => ({
              title: item.label,
              detail: `${item.monthsSeen} mes(es) - ${item.averageAmount.toLocaleString()} ${item.currency}`,
            }))}
          />
          <InsightList
            title="Recurrentes detectados"
            empty="Sin recurrentes nuevos"
            items={topRecurring.map(item => ({
              title: item.label,
              detail: `${item.monthsSeen} mes(es) - ${item.averageAmount.toLocaleString()} ${item.currency}`,
              actionLabel: 'Marcar fijo',
              onAction: () => onMarkRecurringAsFixed(item),
            }))}
          />
          <InsightList
            title="Inusuales"
            empty="Sin alertas claras"
            items={topUnusual.map(item => ({
              title: item.label,
              detail: `${item.amount.toLocaleString()} ${item.currency} - ${item.category}`,
            }))}
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-neutral-200 bg-neutral-950 p-5 text-white shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Proyeccion</p>
        <h3 className="mt-1 text-2xl font-black tracking-tight">Si seguis igual</h3>
        <div className="mt-5 grid gap-3">
          <ProjectionRow label={`Promedio mensual (${insights.projection.currency})`} value={insights.projection.monthlyNetAverage} />
          <ProjectionRow label={`6 meses (${insights.projection.currency})`} value={insights.projection.projectedNet6Months} />
          <ProjectionRow label={`12 meses (${insights.projection.currency})`} value={insights.projection.projectedNet12Months} />
          {insights.projection.inflationAdjustedExpense6Months && (
            <ProjectionRow label={`Gasto 6 meses con IPC (${insights.projection.currency})`} value={-insights.projection.inflationAdjustedExpense6Months} />
          )}
        </div>
        <p className="mt-5 text-xs font-semibold leading-5 text-white/45">
          Usa el promedio reciente y, cuando esta disponible, el IPC oficial nacional para tensionar la proyeccion.
        </p>
      </div>
    </section>
  );
}

function PeriodCurrencyCard({ item }: { item: { currency: string; income: number; expenses: number; net: number } }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{item.currency}</p>
        <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${item.net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {item.net >= 0 ? 'positivo' : 'negativo'}
        </span>
      </div>
      <p className={`mt-2 text-2xl font-black ${item.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
        {item.net >= 0 ? '+' : ''}{item.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black">
        <span className="text-neutral-400">In {item.income.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        <span className="text-neutral-400">Out {item.expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  );
}

function FinancePriorityCard({ priority }: { priority: ReturnType<typeof buildFinancialInsights>['actionPriorities'][number] }) {
  const priorityClass = {
    high: 'border-rose-100 bg-rose-50 text-rose-700',
    medium: 'border-amber-100 bg-amber-50 text-amber-700',
    low: 'border-neutral-100 bg-white text-neutral-500',
  }[priority.priority];

  return (
    <div className={`rounded-2xl border p-3 ${priorityClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-neutral-950">{priority.title}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-neutral-600">{priority.detail}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-widest">
          {priority.priority}
        </span>
      </div>
    </div>
  );
}

function InsightList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { title: string; detail: string; actionLabel?: string; onAction?: () => void }[];
}) {
  return (
    <div className="rounded-[1.5rem] border border-neutral-100 p-4">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">{title}</p>
      <div className="space-y-2">
        {items.length > 0 ? items.map(item => (
          <div key={`${item.title}-${item.detail}`} className="rounded-2xl bg-neutral-50 p-3">
            <p className="truncate text-sm font-black text-neutral-900">{item.title}</p>
            <p className="mt-1 text-xs font-semibold text-neutral-500">{item.detail}</p>
            {item.actionLabel && item.onAction && (
              <button
                type="button"
                onClick={item.onAction}
                className="mt-3 rounded-full bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
              >
                {item.actionLabel}
              </button>
            )}
          </div>
        )) : (
          <p className="rounded-2xl bg-neutral-50 p-3 text-sm font-bold text-neutral-400">{empty}</p>
        )}
      </div>
    </div>
  );
}

function ExpenseProfileStat({ label, value, currency }: { label: string; value: number; currency?: string }) {
  return (
    <div className="rounded-[1.25rem] border border-neutral-100 bg-white p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-black text-neutral-950">
        {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}{currency ? ` ${currency}` : ''}
      </p>
    </div>
  );
}

function ProjectionRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p>
      <p className={`mt-1 text-3xl font-black tracking-tight ${value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {value >= 0 ? '+' : ''}{value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}
