// Panel de movimientos que necesitan acción (saldos sin aplicar, sin cuenta, etc.),
// con edición inline y aplicar saldo. Extraído de FinanceTracker.tsx (Fase B).
import { useState } from 'react';
import { format } from 'date-fns';
import type { BalanceIntegrityIssue } from '../finance.diagnostics';
import { parseFinanceDateValue } from '../finance.format';
import {
  buildFinanceTraceDetails,
  financeNeedsDestinationAccount,
  getFinanceAccountFieldLabel,
  getFinanceTypeLabel,
  isUsefulAuditValue,
} from '../finance.movementDisplay';
import { findSuggestedDestinationAccount } from '../finance.pendingImport';
import { isGenericBankMovementText } from '../finance.categories';
import { CURRENCIES } from '../finance.constants';
import { AuditField } from './AuditField';
import { FinanceMovementDetailDisplay } from './FinanceMovementDetailDisplay';

export function BalanceIntegrityPanel({
  issues,
  accounts,
  categories,
  onApplyBalance,
  onSaveDetails,
}: {
  issues: BalanceIntegrityIssue[];
  accounts: any[];
  categories: any[];
  onApplyBalance: (finance: any) => Promise<boolean>;
  onSaveDetails: (finance: any, draft: any) => void;
}) {
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [applyingIssueId, setApplyingIssueId] = useState<string | null>(null);
  const [issueMessage, setIssueMessage] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<any>(null);

  if (!issues.length) return null;

  const topIssues = issues.slice(0, 5);
  const startEditing = (issue: BalanceIntegrityIssue) => {
    const finance = issue.finance;
    const date = parseFinanceDateValue(finance.date) || new Date();
    const details = buildFinanceTraceDetails(finance, accounts);
    setEditingIssueId(issue.id);
    setDraft({
      amount: Number(finance.amount || 0),
      currency: finance.currency || 'ARS',
      merchantName: details.merchant || finance.merchantName || finance.merchant || '',
      description: finance.description || '',
      category: finance.category || '',
      subCategory: finance.subCategory || '',
      accountId: finance.sourceAccountId || finance.accountId || '',
      toAccountId: finance.toAccountId || findSuggestedDestinationAccount(finance, accounts) || '',
      date: format(date, 'yyyy-MM-dd'),
    });
  };

  return (
    <section className="rounded-[2rem] border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700">Necesitan accion</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Movimientos pendientes</h3>
        </div>
        <p className="max-w-xl text-xs font-bold leading-5 text-amber-800">
          Resolver esto mejora la confianza del saldo. Si falta una cuenta real, edita el movimiento; si ya esta claro, aplica saldo.
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {topIssues.map(issue => {
          const finance = issue.finance;
          const date = parseFinanceDateValue(finance.date);
          const details = buildFinanceTraceDetails(finance, accounts);
          const isEditing = editingIssueId === issue.id && draft;
          const selectedCategory = categories.find(category => category.name === draft?.category);
          const subCategories = selectedCategory?.subCategories || [];
          const needsDestinationAccount = isEditing && financeNeedsDestinationAccount({
            ...finance,
            ...draft,
            category: draft?.category || finance.category,
            subCategory: draft?.subCategory || finance.subCategory,
          });
          const visibleRows = details.rows.filter(row => row.label !== 'Huella' && isUsefulAuditValue(row.value));
          const visibleLongRows = details.longRows.filter(row =>
            isUsefulAuditValue(row.value) &&
            row.label !== 'Linea del resumen' &&
            !isGenericBankMovementText(String(row.value || ''))
          );
          const rawRows = details.longRows.filter(row =>
            isUsefulAuditValue(row.value) &&
            (row.label === 'Linea del resumen' || row.label === 'Detalle tarjeta debito' || isGenericBankMovementText(String(row.value || '')))
          );
          const isRawExpanded = expandedIssueId === issue.id;

          return (
            <div key={issue.id} className="rounded-3xl border border-amber-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-neutral-950">{issue.title}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-neutral-500">{issue.helper}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-800">
                  Revisar
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
                {isEditing ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AuditField label="Monto">
                      <input type="number" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black" />
                    </AuditField>
                    <AuditField label="Moneda">
                      <select value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value })} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black">
                        {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </AuditField>
                    <AuditField label="Fecha">
                      <input type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black" />
                    </AuditField>
                    <AuditField label="Categoria">
                      <select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value, subCategory: '' })} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black">
                        <option value="">Elegir categoria</option>
                        {categories.map(category => <option key={category.id || category.name} value={category.name}>{category.name}</option>)}
                      </select>
                    </AuditField>
                    <AuditField label="Subcategoria">
                      <select value={draft.subCategory} onChange={event => setDraft({ ...draft, subCategory: event.target.value })} disabled={!draft.category} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black disabled:text-neutral-300">
                        <option value="">Sin subcategoria</option>
                        {subCategories.map((sub: any) => {
                          const name = typeof sub === 'string' ? sub : sub.name;
                          return <option key={name} value={name}>{name}</option>;
                        })}
                      </select>
                    </AuditField>
                    <AuditField label={getFinanceAccountFieldLabel({ ...finance, ...draft })}>
                      <select value={draft.accountId} onChange={event => setDraft({ ...draft, accountId: event.target.value })} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black">
                        <option value="">Sin cuenta</option>
                        {accounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
                      </select>
                    </AuditField>
                    {needsDestinationAccount && (
                      <AuditField label="Cuenta destino">
                        <select value={draft.toAccountId || ''} onChange={event => setDraft({ ...draft, toAccountId: event.target.value })} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black">
                          <option value="">Elegir destino</option>
                          {accounts
                            .filter(account => account.id !== draft.accountId)
                            .map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
                        </select>
                      </AuditField>
                    )}
                    <AuditField label="Descripcion">
                      <input value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black" />
                    </AuditField>
                  </div>
                ) : (
                  <FinanceMovementDetailDisplay
                    title={finance.description || finance.note || 'Movimiento'}
                    subtitle={[finance.category || 'Sin categoria', finance.subCategory].filter(Boolean).join(' / ')}
                    amount={`${Number(finance.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${finance.currency || 'ARS'}`}
                    amountClassName={(finance.type || finance.kind) === 'income'
                      ? 'text-emerald-700'
                      : (finance.type || finance.kind) === 'transfer'
                        ? 'text-amber-700'
                        : 'text-red-700'}
                    badges={[
                      details.trace.importedFile || finance.importSource || '',
                      finance.source || '',
                      issue.title,
                    ]}
                    rows={[
                      { label: 'Fecha', value: date ? date.toLocaleDateString('es-AR') : 'Sin fecha' },
                      { label: 'Tipo', value: getFinanceTypeLabel(finance.type || finance.kind || 'expense') },
                      ...visibleRows,
                      ...visibleLongRows.map(row => ({ ...row, wrap: true })),
                    ]}
                    rawRows={rawRows.map(row => ({ ...row, wrap: true }))}
                    rawExpanded={isRawExpanded}
                    onToggleRaw={rawRows.length > 0 ? () => setExpandedIssueId(isRawExpanded ? null : issue.id) : undefined}
                  />
                )}
              </div>

              {issueMessage[issue.id] && (
                <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
                  {issueMessage[issue.id]}
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingIssueId(null);
                        setDraft(null);
                      }}
                      className="rounded-2xl border border-neutral-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-600 transition hover:border-neutral-400"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onSaveDetails(finance, draft);
                        setEditingIssueId(null);
                        setDraft(null);
                      }}
                      className="rounded-2xl bg-neutral-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
                    >
                      Guardar cambios
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEditing(issue)}
                      className="rounded-2xl border border-neutral-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-600 transition hover:border-neutral-400"
                    >
                      Editar
                    </button>
                    {issue.canApplyBalance && (
                      <button
                        type="button"
                        onClick={async () => {
                          setApplyingIssueId(issue.id);
                          setIssueMessage(prev => ({ ...prev, [issue.id]: '' }));
                          const applied = await onApplyBalance(finance);
                          setApplyingIssueId(null);
                          setIssueMessage(prev => ({
                            ...prev,
                            [issue.id]: applied
                              ? 'Saldo aplicado. Si la tarjeta no desaparece sola, actualiza la vista en unos segundos.'
                              : 'No pude aplicar saldo. Revisá que tenga cuenta usada y que el movimiento no esté pendiente/anulado.',
                          }));
                        }}
                        disabled={applyingIssueId === issue.id}
                        className="rounded-2xl bg-neutral-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:bg-neutral-400"
                      >
                        {applyingIssueId === issue.id ? 'Aplicando...' : 'Aplicar saldo'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {issues.length > topIssues.length && (
        <p className="mt-3 text-xs font-bold text-amber-800">
          Hay {issues.length - topIssues.length} movimiento(s) mas con revision pendiente.
        </p>
      )}
    </section>
  );
}
