// Panel para resolver por grupos los movimientos importados parecidos (descartar
// duplicados, asignar cuenta/categoría en lote). Extraído de FinanceTracker.tsx (Fase B).
import { useState } from 'react';
import type { PendingImportGroup } from '../finance.importTypes';
import { financeNeedsDestinationAccount, getFinanceAccountFieldLabel } from '../finance.movementDisplay';
import { pendingTransactionNeedsAccount } from '../finance.pendingImport';
import { FINANCE_TYPES } from '../finance.typeOptions';

export function PendingImportGroupsPanel({
  groups,
  accounts,
  categories,
  onApplyAccounts,
  onApplyCategory,
  onConfirmGroup,
  onDiscardGroup,
  onLinkGroup,
}: {
  groups: PendingImportGroup[];
  accounts: any[];
  categories: any[];
  onApplyAccounts: (group: PendingImportGroup, accountId: string, toAccountId?: string) => void;
  onApplyCategory: (group: PendingImportGroup, updates: { category: string; subCategory?: string; subSubCategory?: string; isFixed?: boolean }) => void;
  onConfirmGroup: (group: PendingImportGroup, forceDuplicates?: boolean) => void;
  onDiscardGroup: (group: PendingImportGroup) => void;
  onLinkGroup: (group: PendingImportGroup) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { accountId: string; toAccountId: string; category: string; subCategory: string; isFixed: boolean }>>({});
  if (groups.length === 0) return null;

  const updateDraft = (groupKey: string, patch: Partial<{ accountId: string; toAccountId: string; category: string; subCategory: string; isFixed: boolean }>) => {
    setDrafts(prev => ({
      ...prev,
      [groupKey]: {
        accountId: prev[groupKey]?.accountId || '',
        toAccountId: prev[groupKey]?.toAccountId || '',
        category: prev[groupKey]?.category || '',
        subCategory: prev[groupKey]?.subCategory || '',
        isFixed: prev[groupKey]?.isFixed || false,
        ...patch,
      },
    }));
  };

  return (
    <section className="rounded-2xl border border-amber-100 bg-white/80 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Resolver por grupos</p>
          <h3 className="mt-1 text-lg font-black text-neutral-950">Acciones rapidas sobre movimientos parecidos</h3>
        </div>
        <p className="max-w-xl text-xs font-semibold leading-5 text-amber-800">
          Usalo para descartar duplicados o asignar una misma cuenta a varios movimientos. La revision individual queda abajo como respaldo.
        </p>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {groups.map(group => {
          const draft = drafts[group.key] || {
            accountId: group.sample.accountId || '',
            toAccountId: group.sample.toAccountId || '',
            category: group.category || '',
            subCategory: group.subCategory || '',
            isFixed: Boolean(group.sample.isFixed),
          };
          const requiresDestination = financeNeedsDestinationAccount({
            ...group.sample,
            type: group.sample.type || group.type,
            category: draft.category || group.category || group.sample.category,
            subCategory: draft.subCategory || group.subCategory || group.sample.subCategory,
          });
          const canApplyAccounts = Boolean(draft.accountId && (!requiresDestination || draft.toAccountId));
          const selectedCategory = categories.find(category => category.name === draft.category);
          const subCategories = selectedCategory?.subCategories || [];
          const canApplyCategory = Boolean(draft.category);
          const groupTone = group.kind === 'duplicate'
            ? 'border-red-100 bg-red-50'
            : group.kind === 'missing_account'
              ? 'border-amber-100 bg-amber-50'
              : 'border-neutral-100 bg-neutral-50';

          return (
            <article key={group.key} className={`rounded-2xl border p-4 ${groupTone}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black text-neutral-950">{group.title}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-neutral-600">{group.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                    <span>{group.count} movimiento(s)</span>
                    <span>{group.totalAmount.toLocaleString()} {group.currency}</span>
                    <span>{FINANCE_TYPES.find(item => item.id === group.type)?.label || group.type}</span>
                  </div>
                </div>

                {group.kind === 'duplicate' ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onDiscardGroup(group)}
                      className="rounded-xl bg-red-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-red-800"
                    >
                      Descartar grupo
                    </button>
                    {group.transactionIds.length > 0 && group.sample.duplicateOfId && (
                      <button
                        type="button"
                        onClick={() => onLinkGroup(group)}
                        className="rounded-xl bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
                      >
                        Vincular grupo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onConfirmGroup(group, true)}
                      disabled={pendingTransactionNeedsAccount(group.sample)}
                      className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:text-neutral-300"
                    >
                      Guardar igual
                    </button>
                  </div>
                ) : null}
              </div>

              {group.kind !== 'duplicate' && (
                <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
                  <label className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Categoria</span>
                    <select
                      value={draft.category}
                      onChange={event => updateDraft(group.key, { category: event.target.value, subCategory: '' })}
                      className="w-full rounded-xl border border-white bg-white px-3 py-2 text-xs font-black text-neutral-900 outline-none"
                    >
                      <option value="">Elegir categoria</option>
                      {categories.map(category => (
                        <option key={category.id || category.name} value={category.name}>{category.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Subcategoria</span>
                    <select
                      value={draft.subCategory}
                      onChange={event => updateDraft(group.key, { subCategory: event.target.value })}
                      disabled={!draft.category || subCategories.length === 0}
                      className="w-full rounded-xl border border-white bg-white px-3 py-2 text-xs font-black text-neutral-900 outline-none disabled:text-neutral-300"
                    >
                      <option value="">Sin subcategoria</option>
                      {subCategories.map((subcategory: any) => {
                        const name = typeof subcategory === 'string' ? subcategory : subcategory.name;
                        return <option key={name} value={name}>{name}</option>;
                      })}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                      {getFinanceAccountFieldLabel({
                        ...group.sample,
                        type: group.sample.type || group.type,
                        category: draft.category || group.category || group.sample.category,
                        subCategory: draft.subCategory || group.subCategory || group.sample.subCategory,
                      })}
                    </span>
                    <select
                      value={draft.accountId}
                      onChange={event => updateDraft(group.key, { accountId: event.target.value })}
                      className="w-full rounded-xl border border-white bg-white px-3 py-2 text-xs font-black text-neutral-900 outline-none"
                    >
                      <option value="">Elegir cuenta</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                      ))}
                    </select>
                  </label>

                  {requiresDestination ? (
                    <label className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Cuenta destino</span>
                      <select
                        value={draft.toAccountId}
                        onChange={event => updateDraft(group.key, { toAccountId: event.target.value })}
                        className="w-full rounded-xl border border-white bg-white px-3 py-2 text-xs font-black text-neutral-900 outline-none"
                      >
                        <option value="">Elegir destino</option>
                        {accounts.map(account => (
                          <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                      <input
                        type="checkbox"
                        checked={draft.isFixed}
                        onChange={event => updateDraft(group.key, { isFixed: event.target.checked })}
                        className="h-4 w-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Fijo</span>
                    </label>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onApplyCategory(group, { category: draft.category, subCategory: draft.subCategory, isFixed: draft.isFixed })}
                      disabled={!canApplyCategory}
                      className="rounded-xl bg-amber-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
                    >
                      Categorizar
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyAccounts(group, draft.accountId, draft.toAccountId)}
                      disabled={!canApplyAccounts}
                      className="rounded-xl bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => onConfirmGroup(group)}
                      disabled={!group.canBulkConfirm}
                      className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
                    >
                      Guardar grupo
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
