// Paneles de conciliación de cuentas: vista general de cuentas + lista corta de
// cuentas a conciliar. Extraído de FinanceTracker.tsx (Fase B del refactor).
import { format } from 'date-fns';
import { getAccountReconciliationInfo, formatAccountBalance } from '../finance.accounts';
import { getReconciliationWeight } from '../finance.accountSummary';
import type { AccountActivitySummary } from '../finance.accountSummary';
import { parseFinanceDateValue, formatSignedMoney } from '../finance.format';
import { getAccountTypeLabel } from '../finance.accountForm';

export function AccountReconciliationOverview({
  accounts,
  accountActivityById,
  onEditAccount,
  onViewAccountActivity,
}: {
  accounts: any[];
  accountActivityById: Map<string, AccountActivitySummary>;
  onEditAccount: (account: any) => void;
  onViewAccountActivity: (accountId: string) => void;
}) {
  if (!accounts.length) return null;

  const sortedAccounts = [...accounts].sort((a, b) => {
    const aReconciliation = getAccountReconciliationInfo(a);
    const bReconciliation = getAccountReconciliationInfo(b);
    const byTone = getReconciliationWeight(bReconciliation.tone) - getReconciliationWeight(aReconciliation.tone);
    if (byTone !== 0) return byTone;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const pendingCount = sortedAccounts.reduce((total, account) => {
    const activity = accountActivityById.get(account.id);
    return total + Number(activity?.pendingCount || 0);
  }, 0);
  const staleCount = sortedAccounts.filter(account => getAccountReconciliationInfo(account).tone !== 'ok').length;

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Conciliacion</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Cuentas</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">
            {accounts.length} cuenta(s)
          </span>
          {staleCount > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700">
              {staleCount} a conciliar
            </span>
          )}
          {pendingCount > 0 && (
            <span className="rounded-full bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-700">
              {pendingCount} pendiente(s)
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedAccounts.map(account => {
          const reconciliation = getAccountReconciliationInfo(account);
          const activity = accountActivityById.get(account.id) || { movementCount: 0, pendingCount: 0, netActivity: 0 };
          const reconciledAt = parseFinanceDateValue(account.lastReconciledAt);
          const toneClass =
            reconciliation.tone === 'danger'
              ? 'border-red-200 bg-red-50/70 text-red-800'
              : reconciliation.tone === 'warn'
                ? 'border-amber-200 bg-amber-50/70 text-amber-800'
                : reconciliation.tone === 'ok'
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-600';

          return (
            <div key={account.id} className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-neutral-950">{account.name}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    {getAccountTypeLabel(account.type)} - {account.currency || 'ARS'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${toneClass}`}>
                  {reconciliation.label}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Saldo</p>
                  <p className="mt-1 text-2xl font-black text-neutral-950">
                    {formatAccountBalance(Number(account.balance || 0), account.type)}
                    <span className="ml-1 text-xs font-bold text-neutral-400">{account.currency || 'ARS'}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onEditAccount(account)}
                    className="rounded-2xl bg-neutral-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
                  >
                    Conciliar
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewAccountActivity(account.id)}
                    className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    Ver movimientos
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="rounded-2xl bg-white px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Ultima</p>
                  <p className="mt-1 text-neutral-800">{reconciledAt ? format(reconciledAt, 'dd/MM/yyyy') : 'Sin conciliar'}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Actividad</p>
                  <p className={`mt-1 ${activity.netActivity < 0 ? 'text-rose-600' : activity.netActivity > 0 ? 'text-emerald-600' : 'text-neutral-800'}`}>
                    {formatSignedMoney(activity.netActivity, account.currency || 'ARS')}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Movimientos</p>
                  <p className="mt-1 text-neutral-800">{activity.movementCount}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Pendientes</p>
                  <p className={activity.pendingCount > 0 ? 'mt-1 text-amber-700' : 'mt-1 text-neutral-800'}>{activity.pendingCount}</p>
                </div>
              </div>

              <p className="mt-3 text-xs font-semibold leading-5 text-neutral-500">{reconciliation.helper}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AccountReconciliationPanel({
  items,
  onEditAccount,
}: {
  items: { account: any; reconciliation: ReturnType<typeof getAccountReconciliationInfo> }[];
  onEditAccount: (account: any) => void;
}) {
  if (!items.length) return null;

  const topItems = items.slice(0, 4);

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Saldos</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Cuentas a conciliar</h3>
        </div>
        <p className="max-w-xl text-xs font-bold leading-5 text-neutral-500">
          Antes de leer caja o patrimonio, conviene que estos saldos reflejen la realidad.
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {topItems.map(({ account, reconciliation }) => (
          <button
            key={account.id}
            type="button"
            onClick={() => onEditAccount(account)}
            className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4 text-left transition hover:border-neutral-300 hover:bg-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-neutral-950">{account.name}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  {getAccountTypeLabel(account.type)} · {account.currency || 'ARS'}
                </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                reconciliation.tone === 'danger'
                  ? 'bg-red-50 text-red-700'
                  : reconciliation.tone === 'warn'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-neutral-100 text-neutral-500'
              }`}>
                {reconciliation.label}
              </span>
            </div>
            <p className="mt-4 text-2xl font-black text-neutral-950">
              {formatAccountBalance(Number(account.balance || 0), account.type)}
              <span className="ml-1 text-xs font-bold text-neutral-400">{account.currency}</span>
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-neutral-500">{reconciliation.helper}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
