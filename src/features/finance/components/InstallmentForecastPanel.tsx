// Panel de compras en cuotas: muestra compromisos próximos y el estimado por mes.
// Extraído de FinanceTracker.tsx (Fase B del refactor).
import { format } from 'date-fns';
import { buildInstallmentForecast } from '../finance.installments';

export function InstallmentForecastPanel({
  forecast,
}: {
  forecast: ReturnType<typeof buildInstallmentForecast>;
}) {
  if (!forecast.activeCount) return null;

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Cuotas</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Compromisos próximos</h3>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-500">
            Estimado desde resúmenes importados. No crea gastos futuros: sirve para anticipar caja.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">
            {forecast.activeCount} compra(s)
          </span>
          {forecast.totalRemainingByCurrency.map(item => (
            <span key={item.currency} className="rounded-full bg-neutral-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-700">
              {item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {item.currency}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3 md:grid-cols-2">
          {forecast.items.slice(0, 4).map(item => (
            <div key={item.key} className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-neutral-950">{item.label}</p>
                  <p className="mt-1 truncate text-xs font-bold text-neutral-500">{item.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-600">
                  {item.currentInstallment}/{item.totalInstallments}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="rounded-2xl bg-white px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Próxima</p>
                  <p className="mt-1 text-neutral-800">{format(item.nextDueDate, 'MM/yyyy')}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Restan</p>
                  <p className="mt-1 text-neutral-800">{item.remainingCount}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Cuota</p>
                  <p className="mt-1 text-neutral-800">{item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {item.currency}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Cuenta</p>
                  <p className="mt-1 truncate text-neutral-800">{item.accountName || 'No detectada'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Próximos meses</p>
          <div className="mt-3 space-y-2">
            {forecast.monthlyTotals.length ? forecast.monthlyTotals.map(item => (
              <div key={`${item.monthKey}-${item.currency}`} className="flex items-center justify-between rounded-2xl bg-white px-3 py-3 text-xs font-black text-neutral-800">
                <span>{formatForecastMonth(item.monthKey)}</span>
                <span>{item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {item.currency}</span>
              </div>
            )) : (
              <p className="rounded-2xl bg-white px-3 py-3 text-xs font-bold text-neutral-500">Sin próximos meses detectados.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatForecastMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return format(new Date(year, month - 1, 1), 'MM/yyyy');
}
