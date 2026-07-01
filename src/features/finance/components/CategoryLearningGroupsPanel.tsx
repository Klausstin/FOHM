// Panel para corregir grupos de movimientos con categoría floja ("Otros"),
// aplicando una corrección a todo el grupo. Extraído de FinanceTracker.tsx (Fase B).
import { useState } from 'react';
import { getFinanceCategoryClarityStats } from '../finance.categories';
import { financeNeedsDestinationAccount } from '../finance.movementDisplay';
import { formatPendingDate } from '../finance.pendingImport';
import { PAYMENT_TYPES, FINANCE_BENEFICIARIES, FINANCE_SCOPE_OPTIONS } from '../finance.constants';
import { PendingMeta } from './PendingMeta';

export function CategoryLearningGroupsPanel({
  groups,
  categories,
  accounts,
  clarityStats,
  onApply,
}: {
  groups: any[];
  categories: any[];
  accounts: any[];
  clarityStats: ReturnType<typeof getFinanceCategoryClarityStats>;
  onApply: (group: any, draft: {
    category: string;
    subCategory: string;
    subSubCategory: string;
    isFixed: boolean;
    accountId: string;
    toAccountId: string;
    paymentType: string;
    beneficiaryType: string;
    beneficiaryLabel: string;
    scope: string;
    visibility: string;
  }) => void;
}) {
  if (groups.length === 0 && clarityStats.count === 0) return null;
  const hasClarityDebt = clarityStats.count > 0;

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Aprendizaje</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Corregir grupos similares</h3>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-500">
            VEO revisa movimientos en Otros, Sin categoria o inferidos para detectar donde el analisis pierde precision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {groups.length} grupo(s)
          </span>
          {hasClarityDebt && (
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 border border-amber-100">
              {clarityStats.count} poco claros
            </span>
          )}
        </div>
      </div>

      {hasClarityDebt && (
        <div className="mb-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="rounded-2xl bg-amber-50 p-4 border border-amber-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Calidad</p>
            <p className="mt-1 text-3xl font-black text-neutral-950">{Math.round(clarityStats.share * 100)}%</p>
            <p className="mt-1 text-xs font-bold text-amber-800">del gasto tiene categoria debil</p>
          </div>
          <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Monto afectado</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {clarityStats.totalAmountByCurrency.length > 0 ? clarityStats.totalAmountByCurrency.map(item => (
                <span key={item.currency} className="rounded-full bg-white px-3 py-2 text-xs font-black text-neutral-700 border border-neutral-100">
                  {item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {item.currency}
                </span>
              )) : (
                <span className="text-xs font-bold text-neutral-400">Sin monto relevante</span>
              )}
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-neutral-500">
              Corregir estos grupos mejora reportes, recurrentes, proyecciones y memoria futura de Luz.
            </p>
          </div>
        </div>
      )}

      {groups.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {groups.map(group => (
            <CategoryLearningGroupCard
              key={group.key}
              group={group}
              categories={categories}
              accounts={accounts}
              onApply={onApply}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm font-bold leading-6 text-neutral-500">
          Hay movimientos poco claros, pero todavia no forman patrones repetidos. Cuando aparezcan similitudes, VEO los va a agrupar para corregirlos de una vez.
        </div>
      )}
    </section>
  );
}

function CategoryLearningGroupCard({
  group,
  categories,
  accounts,
  onApply,
}: {
  group: any;
  categories: any[];
  accounts: any[];
  onApply: (group: any, draft: {
    category: string;
    subCategory: string;
    subSubCategory: string;
    isFixed: boolean;
    accountId: string;
    toAccountId: string;
    paymentType: string;
    beneficiaryType: string;
    beneficiaryLabel: string;
    scope: string;
    visibility: string;
  }) => void;
}) {
  const [draft, setDraft] = useState({
    category: '',
    subCategory: '',
    subSubCategory: '',
    isFixed: false,
    accountId: '',
    toAccountId: '',
    paymentType: '',
    beneficiaryType: '',
    beneficiaryLabel: '',
    scope: '',
    visibility: '',
  });
  const [showDetails, setShowDetails] = useState(false);
  const selectedCategory = categories.find(category => category.name === draft.category);
  const needsDestinationAccount = financeNeedsDestinationAccount({
    ...group,
    type: group.type || group.kind || 'expense',
    category: draft.category || group.currentCategory || group.category,
    subCategory: draft.subCategory || group.currentSubCategory || group.subCategory,
    toAccountId: draft.toAccountId || group.toAccountId,
  });
  const canApply = Boolean(
    draft.category ||
    draft.subCategory ||
    draft.subSubCategory ||
    draft.accountId ||
    (needsDestinationAccount && draft.toAccountId) ||
    draft.paymentType ||
    draft.beneficiaryLabel ||
    draft.scope ||
    draft.isFixed,
  );

  return (
    <article className="rounded-[1.5rem] border border-neutral-100 bg-neutral-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-neutral-950">{group.label}</p>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            {group.count} movimientos - promedio {group.averageAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {group.currency}
          </p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Actual: {group.currentCategory || 'Sin categoria'}
          </p>
          {group.reason && (
            <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-amber-600">
              {group.reason}
            </p>
          )}
          <p className="mt-1 text-[10px] font-bold text-neutral-400">
            {[
              group.accountId ? `Cuenta: ${accounts.find(account => account.id === group.accountId)?.name || 'asignada'}` : '',
              group.paymentType ? `Medio: ${group.paymentType}` : '',
              group.beneficiaryLabel ? `Para: ${group.beneficiaryLabel}` : '',
            ].filter(Boolean).join(' · ') || 'Sin contexto operativo claro'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            similares
          </span>
          <button
            type="button"
            onClick={() => setShowDetails(prev => !prev)}
            className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-700 transition hover:border-neutral-400"
          >
            {showDetails ? 'Ocultar info' : '+ info'}
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="mt-4 rounded-3xl border border-neutral-100 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Muestras del grupo</p>
              <p className="mt-1 text-xs font-bold text-neutral-500">
                Hasta 5 movimientos con el detalle que VEO tiene del resumen.
              </p>
            </div>
            <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
              {group.samples?.length || 0} visibles
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {(group.samples || []).map((sample: any, index: number) => {
              const sourceAccount = accounts.find(account => account.id === sample.sourceAccountId);
              const destinationAccount = accounts.find(account => account.id === sample.toAccountId);
              const sampleNeedsDestination = financeNeedsDestinationAccount(sample);
              return (
                <div key={sample.id || index} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-neutral-950">
                        {sample.originalDescription || sample.description || 'Movimiento'}
                      </p>
                      {sample.description && sample.description !== sample.originalDescription && (
                        <p className="mt-1 truncate text-xs font-bold text-neutral-500">
                          Guardado como: {sample.description}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-black text-neutral-950">
                      {sample.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {sample.currency}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <PendingMeta label="Fecha" value={formatPendingDate(sample.date)} />
                    <PendingMeta label="Referencia" value={sample.merchantName || 'No detectado'} />
                    <PendingMeta label="Cuenta usada" value={sourceAccount?.name || 'No detectada'} />
                    <PendingMeta label="Para" value={sample.beneficiaryLabel} />
                    <PendingMeta label="Medio" value={sample.paymentType} />
                    {sampleNeedsDestination && <PendingMeta label="Destino" value={destinationAccount?.name} />}
                    <PendingMeta label="Archivo" value={sample.importedFile || sample.importSource} />
                    <PendingMeta label="Cuotas" value={sample.installmentLabel} />
                    <PendingMeta label="Detalle" value={sample.transferDetail} />
                    <PendingMeta label="Alias" value={sample.counterpartyAlias} />
                    <PendingMeta label="CBU/CVU" value={sample.counterpartyAccount} />
                    <PendingMeta label="Linea resumen" value={sample.sourceLine || sample.originalDescription} wrap />
                    <PendingMeta label="Huella movimiento" value={sample.transactionFingerprint} wrap />
                    <PendingMeta label="Huella resumen" value={sample.statementFingerprint} wrap />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <select
          value={draft.category}
          onChange={(event) => setDraft({ ...draft, category: event.target.value, subCategory: '', subSubCategory: '' })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Categoria</option>
          {categories.map(category => (
            <option key={category.id} value={category.name}>{category.name}</option>
          ))}
        </select>

        <select
          value={draft.subCategory}
          onChange={(event) => setDraft({ ...draft, subCategory: event.target.value, subSubCategory: '' })}
          disabled={!selectedCategory}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none disabled:text-neutral-300"
        >
          <option value="">Subcategoria</option>
          {(selectedCategory?.subCategories || []).map((sub: any) => {
            const name = typeof sub === 'string' ? sub : sub.name;
            return <option key={name} value={name}>{name}</option>;
          })}
        </select>

        <select
          value={draft.accountId}
          onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Cuenta usada</option>
          {accounts.map(account => (
            <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
          ))}
        </select>

        <select
          value={draft.paymentType}
          onChange={(event) => setDraft({ ...draft, paymentType: event.target.value })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Medio de pago</option>
          {PAYMENT_TYPES.map(paymentType => (
            <option key={paymentType} value={paymentType}>{paymentType}</option>
          ))}
        </select>

        <select
          value={draft.beneficiaryLabel}
          onChange={(event) => {
            const option = FINANCE_BENEFICIARIES.find(item => item.label === event.target.value);
            setDraft({
              ...draft,
              beneficiaryLabel: option?.label || '',
              beneficiaryType: option?.type || '',
              scope: option?.scope || draft.scope,
              visibility: option ? 'household_shared' : draft.visibility,
            });
          }}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Para</option>
          {FINANCE_BENEFICIARIES.map(item => (
            <option key={`${item.type}-${item.label}`} value={item.label}>{item.label}</option>
          ))}
        </select>

        <select
          value={draft.scope}
          onChange={(event) => setDraft({ ...draft, scope: event.target.value, visibility: event.target.value ? 'household_shared' : draft.visibility })}
          className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
        >
          <option value="">Ambito</option>
          {FINANCE_SCOPE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {needsDestinationAccount && (
          <select
            value={draft.toAccountId}
            onChange={(event) => setDraft({ ...draft, toAccountId: event.target.value })}
            className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 text-xs font-black text-neutral-800 outline-none"
          >
            <option value="">Cuenta destino</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
            ))}
          </select>
        )}

      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-black text-neutral-500">
          <input
            type="checkbox"
            checked={draft.isFixed}
            onChange={(event) => setDraft({ ...draft, isFixed: event.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-neutral-900"
          />
          Gasto fijo
        </label>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => onApply(group, { ...draft, toAccountId: needsDestinationAccount ? draft.toAccountId : '' })}
          className="rounded-2xl bg-neutral-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Aplicar al grupo
        </button>
      </div>
    </article>
  );
}
