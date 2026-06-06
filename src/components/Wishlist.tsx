import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Gift, Plus, Trash2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../firebase';
import { createWishlistItem, deleteWishlistItem, subscribeToHouseholdWishlist, updateWishlistItem } from '../features/wishlist/wishlist.service';
import type { WishlistHorizon, WishlistItemRecord, WishlistItemType, WishlistOwner, WishlistStatus, WishlistVisibility } from '../features/wishlist/wishlist.types';

const CURRENCIES = ['ARS', 'USD', 'EUR'];
const CATEGORIES = ['Ropa', 'Tecnologia', 'Casa', 'Viajes', 'Deporte', 'Hobby', 'Experiencias', 'Patrimonio', 'Otros'];
const INPUT_CLASS = 'w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-950 outline-none transition focus:border-neutral-400 focus:bg-white';
const STATUSES: Array<{ id: WishlistStatus; label: string }> = [
  { id: 'wanted', label: 'Deseado' },
  { id: 'evaluating', label: 'Evaluando' },
  { id: 'approved', label: 'Aprobado' },
  { id: 'purchased', label: 'Comprado' },
  { id: 'dismissed', label: 'Descartado' },
];
const ITEM_TYPES: Array<{ id: WishlistItemType; label: string }> = [
  { id: 'purchase', label: 'Compra' },
  { id: 'big_goal', label: 'Objetivo grande' },
  { id: 'experience', label: 'Experiencia' },
  { id: 'asset', label: 'Patrimonial' },
];
const HORIZONS: Array<{ id: WishlistHorizon; label: string }> = [
  { id: 'short', label: 'Corto plazo' },
  { id: 'medium', label: 'Mediano plazo' },
  { id: 'long', label: 'Largo plazo' },
  { id: 'open', label: 'Sin fecha' },
];

export default function Wishlist({ user }: { user: any }) {
  const [items, setItems] = useState<WishlistItemRecord[]>([]);
  const [scope, setScope] = useState<'all' | 'mine' | 'shared'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    estimatedPrice: '',
    currency: user.primaryCurrency || 'ARS',
    reason: '',
    category: 'Otros',
    itemType: 'purchase' as WishlistItemType,
    horizon: 'open' as WishlistHorizon,
    targetDate: '',
    visibility: 'private' as WishlistVisibility,
    owner: 'agustin' as WishlistOwner,
    link: '',
    notes: '',
  });

  useEffect(() => {
    if (!user.householdId) return;
    return subscribeToHouseholdWishlist(
      user.householdId,
      setItems,
      error => handleFirestoreError(error, OperationType.LIST, 'wishlistItems'),
    );
  }, [user.householdId]);

  const visibleItems = useMemo(() => {
    return items.filter(item => {
      if (scope === 'mine') return item.uid === user.uid || item.owner === 'agustin';
      if (scope === 'shared') return item.visibility !== 'private' || item.owner === 'shared';
      return true;
    });
  }, [items, scope, user.uid]);

  const activeItems = visibleItems.filter(item => item.status !== 'purchased' && item.status !== 'dismissed');
  const approvedItems = visibleItems.filter(item => item.status === 'approved');
  const bigGoalItems = activeItems.filter(item => item.itemType === 'big_goal' || item.itemType === 'asset');
  const totalByCurrency = activeItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.currency] = (acc[item.currency] || 0) + Number(item.estimatedPrice || 0);
    return acc;
  }, {});

  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    try {
      await createWishlistItem({
        uid: user.uid,
        householdId: user.householdId,
        title: draft.title,
        estimatedPrice: Number(draft.estimatedPrice || 0),
        currency: draft.currency,
        priority: getNextPriority(items, draft.visibility, draft.owner),
        reason: draft.reason,
        category: draft.category,
        itemType: draft.itemType,
        horizon: draft.horizon,
        targetDate: draft.targetDate,
        visibility: draft.visibility,
        owner: draft.owner,
        link: draft.link,
        notes: draft.notes,
        tags: [],
      });
      setDraft(prev => ({ ...prev, title: '', estimatedPrice: '', reason: '', link: '', notes: '', targetDate: '' }));
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'wishlistItems');
    }
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[2rem] bg-neutral-950 p-6 text-white shadow-sm md:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/40">Decidi mejor</p>
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-4xl font-black tracking-tight md:text-6xl">La Lista</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/60 md:text-base">
                Deseos materiales, compras posibles y objetivos grandes ordenados antes de convertirlos en decisiones reales.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-neutral-950 transition hover:bg-neutral-100"
            >
              <Plus size={18} />
              Agregar
            </button>
          </div>
        </div>

        <aside className="grid grid-cols-3 gap-3 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <MiniStat label="Activos" value={activeItems.length} />
          <MiniStat label="Aprobados" value={approvedItems.length} />
          <MiniStat label="Grandes" value={bigGoalItems.length} />
          <div className="col-span-3 rounded-2xl bg-neutral-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Valor activo</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(totalByCurrency).length === 0 ? (
                <span className="text-sm font-black text-neutral-400">Sin items activos</span>
              ) : Object.entries(totalByCurrency).map(([currency, total]) => (
                <span key={currency} className="rounded-full bg-white px-3 py-2 text-xs font-black text-neutral-700">
                  {Math.round(total).toLocaleString()} {currency}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </header>

      <section className="flex flex-wrap gap-2">
        <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>Todo</ScopeButton>
        <ScopeButton active={scope === 'mine'} onClick={() => setScope('mine')}>Mio</ScopeButton>
        <ScopeButton active={scope === 'shared'} onClick={() => setScope('shared')}>Compartido</ScopeButton>
      </section>

      {isAdding && (
        <form onSubmit={saveItem} className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm md:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_160px_120px]">
            <Field label="Que queres ordenar">
              <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={INPUT_CLASS} placeholder="Ej: zapatillas, casa, viaje, escritorio" />
            </Field>
            <Field label="Valor">
              <input type="number" value={draft.estimatedPrice} onChange={e => setDraft({ ...draft, estimatedPrice: e.target.value })} className={INPUT_CLASS} placeholder="0" />
            </Field>
            <Field label="Moneda">
              <select value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })} className={INPUT_CLASS}>
                {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-6">
            <Field label="Tipo">
              <select value={draft.itemType} onChange={e => setDraft({ ...draft, itemType: e.target.value as WishlistItemType })} className={INPUT_CLASS}>
                {ITEM_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </Field>
            <Field label="Horizonte">
              <select value={draft.horizon} onChange={e => setDraft({ ...draft, horizon: e.target.value as WishlistHorizon })} className={INPUT_CLASS}>
                {HORIZONS.map(horizon => <option key={horizon.id} value={horizon.id}>{horizon.label}</option>)}
              </select>
            </Field>
            <Field label="Motivo">
              <input value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} className={INPUT_CLASS} placeholder="Por que importa?" />
            </Field>
            <Field label="Categoria">
              <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className={INPUT_CLASS}>
                {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Vista">
              <select value={draft.visibility} onChange={e => setDraft({ ...draft, visibility: e.target.value as WishlistVisibility })} className={INPUT_CLASS}>
                <option value="private">Privado</option>
                <option value="shared_with_partner">Con Vicky</option>
                <option value="household_shared">Compartido</option>
              </select>
            </Field>
            <Field label="Dueño">
              <select value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })} className={INPUT_CLASS}>
                <option value="agustin">Agustin</option>
                <option value="vicky">Vicky</option>
                <option value="shared">Ambos</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_180px]">
            <Field label="Link">
              <input value={draft.link} onChange={e => setDraft({ ...draft, link: e.target.value })} className={INPUT_CLASS} placeholder="Opcional" />
            </Field>
            <Field label="Notas">
              <input value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} className={INPUT_CLASS} placeholder="Opcional" />
            </Field>
            <Field label="Fecha objetivo">
              <input type="date" value={draft.targetDate} onChange={e => setDraft({ ...draft, targetDate: e.target.value })} className={INPUT_CLASS} />
            </Field>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setIsAdding(false)} className="rounded-2xl px-5 py-3 text-sm font-black text-neutral-500 hover:bg-neutral-100">Cancelar</button>
            <button type="submit" className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white hover:bg-neutral-800">Guardar</button>
          </div>
        </form>
      )}

      <section className="grid gap-4 xl:grid-cols-3">
        {visibleItems.map(item => (
          <WishlistCard
            key={item.id}
            item={item}
            canMoveUp={activeItems.some(other => Number(other.priority || 999) < Number(item.priority || 999))}
            canMoveDown={activeItems.some(other => Number(other.priority || 999) > Number(item.priority || 999))}
            onMove={(direction) => moveWishlistItem(item, direction, activeItems)}
          />
        ))}
        {visibleItems.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-8 text-center">
            <Gift className="mx-auto text-neutral-300" size={42} />
            <h3 className="mt-4 text-xl font-black text-neutral-900">Sin deseos cargados</h3>
            <p className="mt-2 text-sm font-semibold text-neutral-500">Agrega compras, experiencias u objetivos grandes que quieras ordenar.</p>
          </div>
        )}
      </section>
    </div>
  );
}

async function moveWishlistItem(item: WishlistItemRecord, direction: 'up' | 'down', rankedItems: WishlistItemRecord[]) {
  const activeRanked = rankedItems
    .filter(candidate => candidate.status !== 'purchased' && candidate.status !== 'dismissed')
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
  const currentIndex = activeRanked.findIndex(candidate => candidate.id === item.id);
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  const target = activeRanked[targetIndex];
  if (!target) return;

  try {
    await Promise.all([
      updateWishlistItem(item.id, { priority: Number(target.priority || targetIndex + 1) }),
      updateWishlistItem(target.id, { priority: Number(item.priority || currentIndex + 1) }),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'wishlistItems');
  }
}

function WishlistCard({
  item,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  item: WishlistItemRecord;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: 'up' | 'down') => void;
}) {
  const status = STATUSES.find(status => status.id === item.status);
  const itemType = getItemTypeLabel(item.itemType);
  const horizon = getHorizonLabel(item.horizon);
  const isBigGoal = item.itemType === 'big_goal' || item.itemType === 'asset';

  return (
    <article className={`rounded-[2rem] border bg-white p-5 shadow-sm ${isBigGoal ? 'border-neutral-950/20' : 'border-neutral-200'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-neutral-950 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">#{item.priority}</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">{status?.label || item.status}</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">{itemType}</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">{item.owner === 'shared' ? 'Ambos' : item.owner}</span>
          </div>
          <h3 className="truncate text-2xl font-black tracking-tight text-neutral-950">{item.title}</h3>
          <p className="mt-2 text-sm font-semibold leading-5 text-neutral-500">{item.reason || 'Sin motivo cargado'}</p>
        </div>
        <p className="shrink-0 text-right text-xl font-black text-neutral-950">
          {Number(item.estimatedPrice || 0).toLocaleString()}<br />
          <span className="text-xs text-neutral-400">{item.currency}</span>
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-black uppercase tracking-widest text-neutral-400">{item.category}</span>
          {(isBigGoal || item.horizon) && (
            <span className="text-xs font-bold text-neutral-500">
              {isBigGoal ? 'Impacta plan financiero' : 'Deseo'} · {horizon}
              {item.targetDate ? ` · ${item.targetDate}` : ''}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => onMove('up')} disabled={!canMoveUp} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-25" title="Subir prioridad">
            <ArrowUp size={17} />
          </button>
          <button type="button" onClick={() => onMove('down')} disabled={!canMoveDown} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-25" title="Bajar prioridad">
            <ArrowDown size={17} />
          </button>
          {item.link && (
            <a href={item.link} target="_blank" rel="noreferrer" className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-950">
              <ExternalLink size={17} />
            </a>
          )}
          {item.status !== 'purchased' && (
            <button type="button" onClick={() => updateWishlistItem(item.id, { status: 'purchased' })} className="rounded-xl p-2 text-neutral-400 hover:bg-emerald-50 hover:text-emerald-700" title="Marcar comprado">
              <CheckCircle2 size={17} />
            </button>
          )}
          <button type="button" onClick={() => deleteWishlistItem(item.id)} className="rounded-xl p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600" title="Eliminar">
            <Trash2 size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}

function getItemTypeLabel(itemType?: WishlistItemType) {
  if (itemType === 'big_goal') return 'Objetivo grande';
  if (itemType === 'experience') return 'Experiencia';
  if (itemType === 'asset') return 'Patrimonial';
  return 'Compra';
}

function getHorizonLabel(horizon?: WishlistHorizon) {
  if (horizon === 'short') return 'Corto plazo';
  if (horizon === 'medium') return 'Mediano plazo';
  if (horizon === 'long') return 'Largo plazo';
  return 'Sin fecha';
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <p className="text-2xl font-black text-neutral-950">{value}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
    </div>
  );
}

function ScopeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
        active ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-100'
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function getNextPriority(items: WishlistItemRecord[], visibility: WishlistVisibility, owner: WishlistOwner) {
  const relevantItems = items.filter(item =>
    item.status !== 'purchased' &&
    item.status !== 'dismissed' &&
    (visibility === 'private' ? item.visibility === 'private' && item.owner === owner : item.visibility !== 'private' || item.owner === 'shared')
  );
  const maxPriority = relevantItems.reduce((max, item) => Math.max(max, Number(item.priority || 0)), 0);
  return maxPriority + 1;
}
