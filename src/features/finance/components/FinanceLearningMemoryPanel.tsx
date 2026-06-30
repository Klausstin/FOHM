// Panel de memoria de aprendizaje: lista los mappings aprendidos, su estado,
// evidencia y permite editarlos/desactivarlos. Extraído de FinanceTracker.tsx (Fase B).
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { normalizeDuplicateText } from '../finance.duplicates';
import { buildFinanceLearningKey } from '../finance.taxonomy';
import { parseFinanceTraceNote } from '../finance.trace';
import { parseFinanceDateValue } from '../finance.format';
import { financeNeedsDestinationAccount, getFinanceAccountFieldLabel, getFinanceTypeLabel } from '../finance.movementDisplay';
import { FINANCE_SCOPE_OPTIONS } from '../finance.constants';

function getLearningMappingId(mapping: any) {
  return String(mapping.id || mapping.learningKey || mapping.merchantKey || mapping.originalDescription || mapping.mappedDescription || 'mapping');
}

function getLearningPatternName(mapping: any) {
  return mapping.merchantName || mapping.mappedDescription || mapping.originalDescription || mapping.learningKey || 'Aprendizaje';
}

function isGenericLearningMapping(mapping: any) {
  const raw = normalizeDuplicateText([
    mapping.merchantName,
    mapping.originalDescription,
    mapping.mappedDescription,
    mapping.learningKey,
  ].filter(Boolean).join(' '));
  const tokens = raw.split(' ').filter(Boolean);
  const genericTerms = new Set([
    'nro',
    'numero',
    'cuenta',
    'pago',
    'con',
    'debito',
    'credito',
    'visa',
    'mastercard',
    'master',
    'operacion',
    'transferencia',
    'compra',
  ]);

  if (!tokens.length) return true;
  if (tokens.length === 1 && (tokens[0].length <= 3 || genericTerms.has(tokens[0]))) return true;
  const usefulTokens = tokens.filter(token => !genericTerms.has(token) && token.length > 3);
  return usefulTokens.length === 0;
}

function getLearningMappingStatus(mapping: any) {
  if (mapping.isArchived) {
    return {
      label: 'Desactivado',
      tone: 'archived' as const,
      className: 'bg-neutral-200 text-neutral-500',
      helper: 'No se aplica automaticamente.',
      confidenceLabel: 'No aplica',
    };
  }

  if (isGenericLearningMapping(mapping)) {
    return {
      label: 'Revisar',
      tone: 'review' as const,
      className: 'bg-amber-100 text-amber-800',
      helper: 'El patron parece demasiado generico; conviene revisarlo antes de confiar.',
      confidenceLabel: 'Baja',
    };
  }

  const useCount = Number(mapping.useCount || 1);
  return {
    label: 'Activo',
    tone: 'active' as const,
    className: 'bg-emerald-50 text-emerald-700',
    helper: '',
    confidenceLabel: useCount >= 5 ? 'Alta' : useCount >= 2 ? 'Media' : 'Inicial',
  };
}

function getLearningMappingExamples(mapping: any, finances: any[], accounts: any[]) {
  const mappingKey = mapping.learningKey || buildFinanceLearningKey(mapping.originalDescription || mapping.mappedDescription || '');
  const merchantKey = mapping.merchantKey || '';
  const originalText = normalizeDuplicateText(mapping.originalDescription || mapping.mappedDescription || mapping.merchantName || '');

  return (finances || [])
    .map(finance => {
      const trace = parseFinanceTraceNote(finance.note);
      const financeText = normalizeDuplicateText([
        finance.description,
        finance.originalDescription,
        finance.merchantName,
        finance.merchantKey,
        trace.originalConcept,
        trace.sourceLine,
      ].filter(Boolean).join(' '));
      const financeLearningKey = buildFinanceLearningKey(finance.description || trace.originalConcept || finance.originalDescription || '');
      let score = 0;
      if (mapping.transactionFingerprint && mapping.transactionFingerprint === finance.transactionFingerprint) score += 6;
      if (merchantKey && merchantKey === finance.merchantKey) score += 5;
      if (merchantKey && financeText.includes(normalizeDuplicateText(merchantKey))) score += 4;
      if (mappingKey && financeLearningKey && (financeLearningKey.includes(mappingKey) || mappingKey.includes(financeLearningKey))) score += 3;
      if (originalText && financeText.includes(originalText)) score += 2;
      if (mapping.category && finance.category === mapping.category) score += 1;
      if (mapping.subCategory && finance.subCategory === mapping.subCategory) score += 1;
      if (mapping.sourceAccountId || mapping.accountId) {
        const accountId = mapping.sourceAccountId || mapping.accountId;
        if ((finance.sourceAccountId || finance.accountId) === accountId) score += 1;
      }
      return { finance, score };
    })
    .filter(item => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(item => item.finance);
}

function getLearningSourceLabel(mapping: any, examples: any[]) {
  if (examples.some(example => example.importSource === 'wallet_history' || example.importMode === 'historical_learning')) return 'Historial Wallet';
  if (examples.some(example => example.source === 'pdf' || String(example.importSource || '').includes('bbva'))) return 'Importacion bancaria';
  if (examples.some(example => example.generatedBy)) return 'Carga manual o Luz';
  if (mapping.transactionFingerprint) return 'Correccion de movimiento';
  return 'Aprendizaje previo';
}

function formatLearningExample(finance: any, accounts: any[]) {
  const date = parseFinanceDateValue(finance.date);
  const account = accounts.find(item => item.id === (finance.sourceAccountId || finance.accountId));
  const amount = Number(finance.amount || 0).toLocaleString('es-AR');
  const category = `${finance.category || 'Sin categoria'}${finance.subCategory ? ` / ${finance.subCategory}` : ''}`;
  const status = finance.needsReview ? 'pendiente' : finance.isConfirmed === false ? 'corregido' : 'aceptado';

  return [
    date ? date.toLocaleDateString('es-AR') : 'Sin fecha',
    account?.name || 'Sin cuenta',
    finance.description || finance.originalDescription || 'Sin descripcion',
    `${amount} ${finance.currency || 'ARS'}`,
    category,
    status,
  ].join(' · ');
}

function LearningDetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-neutral-400">{title}</p>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function LearningDetailRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-neutral-50 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</span>
      <span className="break-words text-xs font-bold text-neutral-700 sm:text-right">{value || '-'}</span>
    </div>
  );
}

function LearningEditInput({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</span>
      <input value={value || ''} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-900" />
    </label>
  );
}

function LearningEditSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</span>
      <select value={value || ''} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-900">
        <option value="">Sin definir</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function FinanceLearningMemoryPanel({
  mappings,
  accounts,
  finances,
  categories,
  onArchive,
  onUpdate,
  onDelete,
}: {
  mappings: any[];
  accounts: any[];
  finances: any[];
  categories: any[];
  onArchive: (mapping: any) => void;
  onUpdate: (mapping: any, patch: any) => void;
  onDelete: (mapping: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openMappingId, setOpenMappingId] = useState<string | null>(null);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const sortedMappings = [...(mappings || [])]
    .sort((a, b) => {
      if (Boolean(a.isArchived) !== Boolean(b.isArchived)) return a.isArchived ? 1 : -1;
      const aReview = isGenericLearningMapping(a) ? 1 : 0;
      const bReview = isGenericLearningMapping(b) ? 1 : 0;
      if (aReview !== bReview) return bReview - aReview;
      const usedDiff = Number(b.useCount || 0) - Number(a.useCount || 0);
      if (usedDiff !== 0) return usedDiff;
      const bDate = parseFinanceDateValue(b.lastUsedAt)?.getTime() || 0;
      const aDate = parseFinanceDateValue(a.lastUsedAt)?.getTime() || 0;
      return bDate - aDate;
    });
  const activeMappings = sortedMappings.filter(mapping => !mapping.isArchived);
  const visibleMappings = (isExpanded ? sortedMappings : sortedMappings.slice(0, 6));

  const startEditing = (mapping: any) => {
    const id = getLearningMappingId(mapping);
    setEditingMappingId(id);
    setDrafts(prev => ({
      ...prev,
      [id]: {
        kind: mapping.kind || 'expense',
        neutralType: mapping.neutralType || '',
        category: mapping.category || '',
        subCategory: mapping.subCategory || '',
        subSubCategory: mapping.subSubCategory || '',
        merchantName: mapping.merchantName || '',
        beneficiaryLabel: mapping.beneficiaryLabel || '',
        scope: mapping.scope || '',
        visibility: mapping.visibility || 'household_shared',
        paymentType: mapping.paymentType || '',
        accountId: mapping.sourceAccountId || mapping.accountId || '',
        toAccountId: mapping.toAccountId || '',
      },
    }));
  };

  const saveDraft = (mapping: any) => {
    const id = getLearningMappingId(mapping);
    const draft = drafts[id];
    if (!draft) return;
    const draftNeedsDestination = financeNeedsDestinationAccount({ ...mapping, ...draft });
    onUpdate(mapping, {
      kind: draft.kind || 'expense',
      neutralType: draft.neutralType || null,
      category: draft.category || '',
      subCategory: draft.subCategory || '',
      subSubCategory: draft.subSubCategory || '',
      merchantName: draft.merchantName || '',
      beneficiaryLabel: draft.beneficiaryLabel || '',
      scope: draft.scope || '',
      visibility: draft.visibility || 'household_shared',
      paymentType: draft.paymentType || '',
      accountId: draft.accountId || '',
      sourceAccountId: draft.accountId || '',
      toAccountId: draftNeedsDestination ? draft.toAccountId || '' : '',
    });
    setEditingMappingId(null);
  };

  return (
    <section className="rounded-[2rem] border border-neutral-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Memoria activa</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-neutral-950">
            {activeMappings.length} aprendizaje(s)
          </h3>
          <p className="mt-1 max-w-2xl text-xs font-bold leading-5 text-neutral-500">
            Revisá qué patrón activa cada aprendizaje, qué completa VEO y de dónde salió.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          disabled={sortedMappings.length <= 6}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-700 transition hover:border-neutral-400 disabled:cursor-not-allowed disabled:text-neutral-300"
        >
          {isExpanded ? 'Ver menos' : 'Ver memoria'}
          <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {visibleMappings.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleMappings.map(mapping => {
            const id = getLearningMappingId(mapping);
            const account = accounts.find(item => item.id === (mapping.sourceAccountId || mapping.accountId));
            const destinationAccount = accounts.find(item => item.id === mapping.toAccountId);
            const learnedAt = parseFinanceDateValue(mapping.lastUsedAt);
            const createdAt = parseFinanceDateValue(mapping.createdAt);
            const examples = getLearningMappingExamples(mapping, finances, accounts);
            const status = getLearningMappingStatus(mapping);
            const isOpen = openMappingId === id;
            const isEditing = editingMappingId === id;
            const draft = drafts[id] || {};
            const mappingNeedsDestination = financeNeedsDestinationAccount(isEditing ? { ...mapping, ...draft } : mapping);
            const selectedCategory = categories.find(category => category.name === (draft.category || mapping.category));
            const subCategories = selectedCategory?.subCategories || [];

            return (
              <div key={id} className={`rounded-2xl border p-4 ${status.tone === 'review' ? 'border-amber-200 bg-amber-50/70' : mapping.isArchived ? 'border-neutral-200 bg-neutral-50 opacity-75' : 'border-neutral-100 bg-neutral-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-neutral-950">
                      {getLearningPatternName(mapping)}
                    </p>
                    <p className="mt-1 truncate text-xs font-bold text-neutral-500">
                      {mapping.category || 'Sin categoria'}{mapping.subCategory ? ` / ${mapping.subCategory}` : ''}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <div className="mt-3 text-xs font-bold leading-5 text-neutral-600">
                  <p>Aplicado {Number(mapping.useCount || 1)} vez/veces · Último uso: {learnedAt ? learnedAt.toLocaleDateString('es-AR') : 'sin fecha'}</p>
                  {status.helper && <p className="mt-1 text-amber-700">{status.helper}</p>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  {account && <span className="rounded-full bg-white px-2 py-1">{account.name}</span>}
                  {mapping.paymentType && <span className="rounded-full bg-white px-2 py-1">{mapping.paymentType}</span>}
                  {mapping.beneficiaryLabel && <span className="rounded-full bg-white px-2 py-1">Para {mapping.beneficiaryLabel}</span>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenMappingId(isOpen ? null : id)}
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-700 transition hover:border-neutral-400"
                  >
                    {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
                  </button>
                  {!mapping.isArchived && (
                    <button
                      type="button"
                      onClick={() => onArchive(mapping)}
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 transition hover:border-red-100 hover:bg-red-50 hover:text-red-700"
                    >
                      Desactivar
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3 rounded-2xl border border-white bg-white p-3">
                    <LearningDetailBlock title="Se activa cuando">
                      <LearningDetailRow label="Descripción contiene" value={mapping.originalDescription || mapping.learningKey || '-'} />
                      <LearningDetailRow label="Clave normalizada" value={mapping.learningKey || buildFinanceLearningKey(mapping.originalDescription || mapping.mappedDescription || '') || '-'} />
                      <LearningDetailRow label="Patron normalizado" value={mapping.merchantKey || mapping.merchantName || '-'} />
                      <LearningDetailRow label="Cuenta detectada" value={account?.name || '-'} />
                    </LearningDetailBlock>

                    <LearningDetailBlock title="VEO completa">
                      {isEditing ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <LearningEditSelect label="Tipo" value={draft.kind} onChange={value => setDrafts(prev => ({ ...prev, [id]: { ...draft, kind: value } }))} options={[
                            { value: 'expense', label: 'Gasto' },
                            { value: 'income', label: 'Ingreso' },
                            { value: 'neutral', label: 'Neutro' },
                          ]} />
                          <LearningEditSelect label="Categoria" value={draft.category} onChange={value => setDrafts(prev => ({ ...prev, [id]: { ...draft, category: value, subCategory: '' } }))} options={categories.map(category => ({ value: category.name, label: category.name }))} />
                          <LearningEditSelect label="Subcategoria" value={draft.subCategory} onChange={value => setDrafts(prev => ({ ...prev, [id]: { ...draft, subCategory: value } }))} options={subCategories.map((sub: any) => {
                            const name = typeof sub === 'string' ? sub : sub.name;
                            return { value: name, label: name };
                          })} />
                          <LearningEditInput label="Merchant" value={draft.merchantName} onChange={value => setDrafts(prev => ({ ...prev, [id]: { ...draft, merchantName: value } }))} />
                          <LearningEditInput label="Beneficiario" value={draft.beneficiaryLabel} onChange={value => setDrafts(prev => ({ ...prev, [id]: { ...draft, beneficiaryLabel: value } }))} />
                          <LearningEditSelect label="Scope" value={draft.scope} onChange={value => setDrafts(prev => ({ ...prev, [id]: { ...draft, scope: value } }))} options={FINANCE_SCOPE_OPTIONS} />
                        </div>
                      ) : (
                        <>
                          <LearningDetailRow label="Tipo" value={getFinanceTypeLabel(mapping.kind || 'expense')} />
                          <LearningDetailRow label="Categoria" value={`${mapping.category || 'Sin categoria'}${mapping.subCategory ? ` / ${mapping.subCategory}` : ''}`} />
                          <LearningDetailRow label="Merchant / comercio" value={mapping.merchantName || '-'} />
                          <LearningDetailRow label="Beneficiario" value={mapping.beneficiaryLabel || '-'} />
                          <LearningDetailRow label="Scope" value={mapping.scope || '-'} />
                          <LearningDetailRow label="Visibilidad" value={mapping.visibility || '-'} />
                          <LearningDetailRow label={getFinanceAccountFieldLabel(mapping)} value={account?.name || '-'} />
                          {mappingNeedsDestination && <LearningDetailRow label="Cuenta destino" value={destinationAccount?.name || '-'} />}
                          <LearningDetailRow label="Impacta saldo" value={mapping.kind === 'neutral' && !mapping.neutralType ? 'Depende' : 'Sí, si el movimiento queda contabilizado'} />
                        </>
                      )}
                    </LearningDetailBlock>

                    <LearningDetailBlock title="Evidencia">
                      <LearningDetailRow label="Movimientos asociados" value={examples.length} />
                      <LearningDetailRow label="Veces aplicado" value={Number(mapping.useCount || 1)} />
                      <LearningDetailRow label="Veces corregido" value="No disponible todavía" />
                      <LearningDetailRow label="Confianza estimada" value={status.confidenceLabel} />
                      <LearningDetailRow label="Creado" value={createdAt ? createdAt.toLocaleDateString('es-AR') : 'Sin fecha'} />
                      <LearningDetailRow label="Origen probable" value={getLearningSourceLabel(mapping, examples)} />
                    </LearningDetailBlock>

                    <LearningDetailBlock title="Ejemplos reales">
                      {examples.length ? examples.slice(0, 4).map(example => (
                        <div key={example.id || example.transactionFingerprint || `${example.description}-${example.amount}`} className="rounded-xl bg-neutral-50 px-3 py-2 text-xs font-bold leading-5 text-neutral-600">
                          {formatLearningExample(example, accounts)}
                        </div>
                      )) : (
                        <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-500">Todavía no encontré movimientos asociados en el historial cargado.</p>
                      )}
                    </LearningDetailBlock>

                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => saveDraft(mapping)} className="rounded-xl bg-neutral-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">Guardar output</button>
                          <button type="button" onClick={() => setEditingMappingId(null)} className="rounded-xl border border-neutral-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Cancelar</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => startEditing(mapping)} className="rounded-xl border border-neutral-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-700">Editar output</button>
                      )}
                      {!mapping.isArchived && <button type="button" onClick={() => onArchive(mapping)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-800">Marcar incorrecto</button>}
                      <button type="button" onClick={() => onDelete(mapping)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700">Eliminar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm font-bold leading-6 text-neutral-500">
          Todavia no hay aprendizajes activos. Cuando corrijas categorias o actives memoria Wallet, van a aparecer aca.
        </div>
      )}
    </section>
  );
}
