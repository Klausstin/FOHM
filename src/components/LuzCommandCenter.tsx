import { useMemo, useState } from 'react';
import { Brain, CheckCircle2, Gift, HelpCircle, Loader2, Mic, Send, Sparkles, Wallet, X } from 'lucide-react';
import { applyTransactionToAccountBalances, createFinancialTransaction, updateFinancialTransaction } from '../features/finance/finance.service';
import type { CreateFinancialTransactionInput } from '../features/finance/finance.types';
import { createGoal } from '../features/goals/goal.service';
import { createHabit, createHabitLog } from '../features/habits/habit.service';
import type { HabitRecord } from '../features/habits/habit.types';
import { createJournalEntry } from '../features/journal/journal.service';
import { routeLuzMessage, type LuzAction, type LuzFinancialAccountOption, type LuzRouteResult } from '../features/luz/luzRouter';
import { createWishlistItem } from '../features/wishlist/wishlist.service';
import { TRAVEL_CATEGORIES } from '../features/travel/travel.types';

interface LuzCommandCenterProps {
  user: {
    uid: string;
    householdId?: string | null;
  };
  habits?: HabitRecord[];
  accounts?: LuzFinancialAccountOption[];
  categories?: any[];
}

export default function LuzCommandCenter({ user, habits = [], accounts = [], categories = [] }: LuzCommandCenterProps) {
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<LuzRouteResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [rejectedActionIds, setRejectedActionIds] = useState<string[]>([]);

  const preview = useMemo(() => {
    if (!message.trim()) return null;
    return routeLuzMessage(message, habits, accounts);
  }, [message, habits, accounts]);

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!message.trim() || isSaving) return;

    const nextDraft = routeLuzMessage(message, habits, accounts);
    setDraft(nextDraft);
    setRejectedActionIds([]);
    setStatus(nextDraft.summary);
  };

  const updateDraftAction = (actionId: string, updates: Partial<LuzAction>) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: prev.actions.map(action => action.id === actionId ? { ...action, ...updates } : action),
      };
    });
  };

  const updateDraftFinance = (actionId: string, financeUpdates: Partial<NonNullable<LuzAction['finance']>>) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: prev.actions.map(action => {
          if (action.id !== actionId || !action.finance) return action;
          const nextFinance = { ...action.finance, ...financeUpdates };
          return {
            ...action,
            finance: nextFinance,
            detail: `${Number(nextFinance.amount || 0).toLocaleString()} ${nextFinance.currency} - ${nextFinance.category}. ${nextFinance.accountName ? `Cuenta sugerida: ${nextFinance.accountName}.` : 'Falta confirmar cuenta o billetera.'}`,
          };
        }),
      };
    });
  };

  const updateDraftWishlist = (actionId: string, wishlistUpdates: Partial<NonNullable<LuzAction['wishlist']>>) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: prev.actions.map(action => {
          if (action.id !== actionId || !action.wishlist) return action;
          const nextWishlist = { ...action.wishlist, ...wishlistUpdates };
          return {
            ...action,
            wishlist: nextWishlist,
            detail: `${nextWishlist.title}${nextWishlist.estimatedPrice ? ` - ${Number(nextWishlist.estimatedPrice).toLocaleString()} ${nextWishlist.currency}` : ''}. ${nextWishlist.itemType === 'big_goal' || nextWishlist.itemType === 'asset' ? 'Objetivo grande para mirar contra el plan financiero.' : 'Queda al final del ranking para priorizar despues.'}`,
          };
        }),
      };
    });
  };

  const updateDraftGoal = (actionId: string, goalUpdates: Partial<NonNullable<LuzAction['goal']>>) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: prev.actions.map(action => {
          if (action.id !== actionId || !action.goal) return action;
          const nextGoal = { ...action.goal, ...goalUpdates };
          return {
            ...action,
            goal: nextGoal,
            detail: `${nextGoal.title}. Queda como objetivo anual para conectar despues con habitos, calendario, finanzas y La Lista.`,
          };
        }),
      };
    });
  };

  const updateDraftHabit = (actionId: string, habitUpdates: Partial<NonNullable<LuzAction['habit']>>) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: prev.actions.map(action => {
          if (action.id !== actionId || !action.habit) return action;
          const nextHabit = { ...action.habit, ...habitUpdates };
          return {
            ...action,
            habit: nextHabit,
            detail: `${nextHabit.title}. Lo dejo como habito activo para empezar a medirlo.`,
          };
        }),
      };
    });
  };

  const confirmDraft = async () => {
    if (!draft || isSaving) return;

    const executableActions = draft.actions.filter(action =>
      action.type !== 'ask_follow_up' &&
      action.type !== 'create_calendar_event' &&
      !rejectedActionIds.includes(action.id)
    );
    if (executableActions.length === 0) {
      setStatus('No hay acciones listas para guardar. Respondeme una de las preguntas o cargalo manualmente.');
      return;
    }

    const submittedMessage = message.trim();
    setIsSaving(true);
    setStatus('Guardando...');
    setDraft(null);
    setRejectedActionIds([]);
    setMessage('');

    try {
      for (const action of executableActions) {
        await executeAction(action, submittedMessage);
      }
      setStatus(`Guardado: ${executableActions.length} accion(es). Lo incompleto queda para revisar.`);
    } catch (error) {
      console.error('Luz no pudo guardar la entrada:', error);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code.includes('permission-denied')) {
        setStatus('Firebase rechazo el guardado. Probablemente faltan publicar las reglas nuevas de Firestore.');
      } else {
        setStatus('No pude guardar esto todavia. Revise el detalle en la consola para corregirlo.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const executeAction = async (action: LuzAction, submittedMessage: string) => {
    if (action.type === 'create_finance_transaction' && action.finance) {
      const transactionInput: CreateFinancialTransactionInput = {
        uid: user.uid,
        householdId: user.householdId || `personal-${user.uid}`,
        amount: action.finance.amount,
        currency: action.finance.currency,
        description: action.finance.description,
        note: submittedMessage,
        category: action.finance.category,
        subCategory: action.finance.subCategory || '',
        subSubCategory: action.finance.subSubCategory || '',
        type: action.finance.type,
        kind: action.finance.type === 'transfer' ? 'neutral' : action.finance.type,
        neutralType: action.finance.neutralType,
        accountId: action.finance.accountId || '',
        toAccountId: action.finance.toAccountId || '',
        date: createLocalDate(action.finance.date),
        source: 'manual',
        confidence: action.confidence === 'high' ? 'exact' : 'inferred',
        status: action.finance.needsReview ? 'needs_review' : 'posted',
        needsReview: action.finance.needsReview,
        isConfirmed: !action.finance.needsReview,
        generatedBy: user.uid,
        assignedTo: user.uid,
        paymentType: action.finance.paymentMethod || '',
        paymentStatus: action.finance.needsReview ? 'Pendiente de revisar' : 'Contabilizado',
        travelTripId: action.finance.travelTripId,
        travelTripName: action.finance.travelTripName,
        travelTripSuggestion: action.finance.travelTripSuggestion,
        travelCategory: action.finance.travelCategory,
        originalAmount: action.finance.originalAmount,
        originalCurrency: action.finance.originalCurrency,
      };

      const transactionRef = await createFinancialTransaction(transactionInput);
      if (!action.finance.needsReview) {
        const balanceApplied = await applyTransactionToAccountBalances(transactionInput);
        if (transactionRef?.id) {
          await updateFinancialTransaction(transactionRef.id, { accountBalanceApplied: balanceApplied } as any);
        }
      }
    }

    if (action.type === 'create_journal_entry' && action.journal) {
      await createJournalEntry({
        uid: user.uid,
        householdId: user.householdId || null,
        content: action.journal.content,
        categories: action.journal.categories,
      });
    }

    if (action.type === 'create_habit_checkin' && action.habitCheckin?.habitId) {
      await createHabitLog(action.habitCheckin.habitId, user.uid, action.habitCheckin.date, action.habitCheckin.status);
    }

    if (action.type === 'create_habit' && action.habit) {
      await createHabit({
        uid: user.uid,
        householdId: user.householdId || null,
        title: action.habit.title,
        description: action.habit.description,
        startDate: action.habit.startDate,
        linkedGoalIds: action.habit.linkedGoalIds,
      });
    }

    if (action.type === 'create_goal' && action.goal) {
      await createGoal({
        uid: user.uid,
        householdId: user.householdId || null,
        year: action.goal.year,
        title: action.goal.title,
        description: action.goal.description,
        categories: action.goal.categories,
      });
    }

    if (action.type === 'create_wishlist_item' && action.wishlist) {
      await createWishlistItem({
        uid: user.uid,
        householdId: user.householdId || `personal-${user.uid}`,
        title: action.wishlist.title,
        estimatedPrice: action.wishlist.estimatedPrice,
        currency: action.wishlist.currency,
        priority: 0,
        reason: action.wishlist.reason,
        category: action.wishlist.category,
        itemType: action.wishlist.itemType,
        horizon: action.wishlist.horizon,
        visibility: action.wishlist.visibility,
        owner: action.wishlist.owner,
        notes: submittedMessage,
        tags: [],
      });
    }
  };

  const startDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('Tu navegador no permite dictado directo. Por ahora escribilo aca y Luz lo distribuye.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setStatus('No pude tomar el audio. Probemos escribiendolo.');
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setMessage(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.start();
  };

  const currentActions = draft?.actions || preview?.actions || [];
  const selectedExecutableCount = draft
    ? draft.actions.filter(action => action.type !== 'ask_follow_up' && action.type !== 'create_calendar_event' && !rejectedActionIds.includes(action.id)).length
    : 0;
  const previewType = currentActions.some(action => action.type === 'create_finance_transaction')
    ? 'Finanzas'
    : currentActions.some(action => action.type === 'create_wishlist_item')
      ? 'La Lista'
    : currentActions.some(action => action.type === 'create_goal')
      ? 'Objetivos'
    : currentActions.some(action => action.type === 'create_habit_checkin' || action.type === 'create_habit')
      ? 'Habitos'
      : 'Diario';

  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.08] p-3 md:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
            <Sparkles size={13} />
            Luz
          </p>
        </div>
        {currentActions.length > 0 && (
          <span className="hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-900 sm:inline-flex">
            {previewType === 'Finanzas' ? <Wallet size={13} /> : previewType === 'La Lista' ? <Gift size={13} /> : previewType === 'Habitos' ? <CheckCircle2 size={13} /> : <Brain size={13} />}
            {previewType}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setDraft(null);
            setRejectedActionIds([]);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Escribi o dicta..."
          className="min-h-[120px] w-full resize-none rounded-[1.1rem] border border-white/10 bg-white p-4 text-base font-medium leading-6 text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-white/30 lg:min-h-[132px]"
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-6 text-xs font-semibold text-white/62">
            {status || preview?.summary || ''}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startDictation}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 transition ${isListening ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/15'}`}
              title="Dictar"
            >
              <Mic size={18} />
            </button>
            <button
              type="submit"
              disabled={!message.trim() || isSaving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-xs font-black uppercase tracking-widest text-neutral-950 transition hover:bg-neutral-100 disabled:opacity-45"
            >
              <Send size={16} />
              Enviar
            </button>
          </div>
        </div>
      </form>

      {draft && (
        <div className="mt-3 space-y-3 rounded-[1.15rem] border border-white/10 bg-black/15 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Antes de guardar</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setRejectedActionIds([]);
              }}
              className="rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-2">
            {draft.actions.map(action => (
              <LuzActionCard
                key={action.id}
                action={action}
                isRejected={rejectedActionIds.includes(action.id)}
                onToggleRejected={() => {
                  setRejectedActionIds(prev =>
                    prev.includes(action.id)
                      ? prev.filter(id => id !== action.id)
                      : [...prev, action.id],
                  );
                }}
                onUpdateAction={updateDraftAction}
                onUpdateFinance={updateDraftFinance}
                onUpdateWishlist={updateDraftWishlist}
                onUpdateGoal={updateDraftGoal}
                onUpdateHabit={updateDraftHabit}
                accounts={accounts}
                categories={categories}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setRejectedActionIds([]);
              }}
              className="rounded-2xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              Editar y reinterpretar
            </button>
            <button
              type="button"
              onClick={confirmDraft}
              disabled={isSaving || selectedExecutableCount === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-xs font-black uppercase tracking-widest text-neutral-950 transition hover:bg-neutral-100 disabled:opacity-45"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Confirmar acciones{selectedExecutableCount > 0 ? ` (${selectedExecutableCount})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LuzActionCard({
  action,
  isRejected,
  onToggleRejected,
  onUpdateAction,
  onUpdateFinance,
  onUpdateWishlist,
  onUpdateGoal,
  onUpdateHabit,
  accounts,
  categories,
}: {
  action: LuzAction;
  isRejected: boolean;
  onToggleRejected: () => void;
  onUpdateAction: (actionId: string, updates: Partial<LuzAction>) => void;
  onUpdateFinance: (actionId: string, financeUpdates: Partial<NonNullable<LuzAction['finance']>>) => void;
  onUpdateWishlist: (actionId: string, wishlistUpdates: Partial<NonNullable<LuzAction['wishlist']>>) => void;
  onUpdateGoal: (actionId: string, goalUpdates: Partial<NonNullable<LuzAction['goal']>>) => void;
  onUpdateHabit: (actionId: string, habitUpdates: Partial<NonNullable<LuzAction['habit']>>) => void;
  accounts: LuzFinancialAccountOption[];
  categories: any[];
}) {
  const Icon = action.type === 'create_finance_transaction'
    ? Wallet
    : action.type === 'create_wishlist_item'
      ? Gift
    : action.type === 'create_habit_checkin' || action.type === 'create_habit'
      ? CheckCircle2
      : action.type === 'create_goal'
        ? Brain
    : action.type === 'ask_follow_up'
      ? HelpCircle
      : Brain;
  const [isEditing, setIsEditing] = useState(false);
  const compactSummary = buildCompactActionSummary(action);
  const chips = buildActionChips(action);

  return (
    <div className={`rounded-2xl border p-3 transition ${isRejected ? 'border-white/5 bg-white/[0.04] opacity-45' : 'border-white/10 bg-white/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-950">
            <Icon size={16} />
          </div>
          <div>
            <p className="text-sm font-black text-white">{action.title}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{action.confidence}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleRejected}
          className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition ${isRejected ? 'bg-white text-neutral-950' : 'bg-white/10 text-white/55 hover:bg-white/15 hover:text-white'}`}
          title={isRejected ? 'Volver a incluir accion' : 'No guardar esta accion'}
        >
          {isRejected ? 'Incluir' : 'Quitar'}
        </button>
      </div>

      <p className={`mt-3 text-sm font-black leading-5 ${isRejected ? 'text-white/35 line-through' : 'text-white'}`}>{compactSummary}</p>
      {!isRejected && chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map(chip => (
            <span
              key={chip}
              className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/55"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {!isRejected && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold leading-5 text-white/50">{isEditing ? 'Editando campos antes de guardar.' : action.detail}</p>
          {action.type !== 'ask_follow_up' && (
            <button
              type="button"
              onClick={() => setIsEditing(prev => !prev)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/55 transition hover:bg-white/10 hover:text-white"
            >
              {isEditing ? 'Cerrar' : 'Editar'}
            </button>
          )}
        </div>
      )}

      {!isRejected && action.type === 'create_finance_transaction' && action.finance && (
        isEditing ? (
          <LuzFinanceEditor
            action={action}
            accounts={accounts}
            categories={categories}
            onUpdateFinance={onUpdateFinance}
          />
        ) : null
      )}
      {!isRejected && isEditing && action.type === 'create_wishlist_item' && action.wishlist && (
        <LuzWishlistEditor action={action} onUpdateWishlist={onUpdateWishlist} />
      )}
      {!isRejected && isEditing && action.type === 'create_goal' && action.goal && (
        <LuzGoalEditor action={action} onUpdateGoal={onUpdateGoal} />
      )}
      {!isRejected && isEditing && action.type === 'create_habit' && action.habit && (
        <LuzHabitEditor action={action} onUpdateHabit={onUpdateHabit} />
      )}
    </div>
  );
}

function buildCompactActionSummary(action: LuzAction) {
  if (action.finance) {
    const finance = action.finance;
    return [
      `${Number(finance.amount || 0).toLocaleString()} ${finance.currency}`,
      [finance.category, finance.subCategory].filter(Boolean).join(' / '),
      finance.travelTripSuggestion ? `Viaje: ${finance.travelTripSuggestion}` : '',
      finance.type === 'transfer'
        ? `${finance.accountName || 'Sin origen'} -> ${finance.toAccountName || 'Sin destino'}`
        : finance.accountName || 'Sin cuenta',
    ].filter(Boolean).join(' · ');
  }

  if (action.wishlist) {
    const price = action.wishlist.estimatedPrice
      ? `${Number(action.wishlist.estimatedPrice).toLocaleString()} ${action.wishlist.currency}`
      : 'Sin valor';
    return `${action.wishlist.title} · ${price} · ${action.wishlist.visibility === 'private' ? 'Privado' : 'Compartido'}`;
  }

  if (action.goal) return `${action.goal.title} · Objetivo ${action.goal.year}`;
  if (action.habit) return `${action.habit.title} · Habito nuevo`;
  if (action.habitCheckin) return `${action.habitCheckin.habitTitle} · ${action.habitCheckin.status}`;
  return action.detail;
}

function buildActionChips(action: LuzAction) {
  if (action.finance) {
    return [
      action.finance.travelTripSuggestion ? `Viaje: ${action.finance.travelTripSuggestion}` : '',
      action.finance.travelCategory,
      action.finance.paymentMethod,
      action.finance.date,
    ].filter(Boolean) as string[];
  }

  if (action.journal) return action.journal.categories.map(category => `Diario: ${category}`);
  if (action.wishlist) return [action.wishlist.category, action.wishlist.horizon, action.wishlist.itemType];
  return [];
}

function LuzFinanceEditor({
  action,
  accounts,
  categories,
  onUpdateFinance,
}: {
  action: LuzAction;
  accounts: LuzFinancialAccountOption[];
  categories: any[];
  onUpdateFinance: (actionId: string, financeUpdates: Partial<NonNullable<LuzAction['finance']>>) => void;
}) {
  const finance = action.finance;
  if (!finance) return null;

  const selectedCategory = categories.find(category => category.name === finance.category);
  const inferredTravelSubCategories = finance.category === 'Viajes'
    ? TRAVEL_CATEGORIES.map(name => ({ name }))
    : [];
  const categoryOptions = selectedCategory || !finance.category
    ? categories
    : [{ id: `inferred-${finance.category}`, name: finance.category, subCategories: [] }, ...categories];
  const rawSubCategories = selectedCategory?.subCategories?.length
    ? selectedCategory.subCategories
    : inferredTravelSubCategories;
  const hasCurrentSubCategory = rawSubCategories.some((sub: any) => (typeof sub === 'string' ? sub : sub.name) === finance.subCategory);
  const subCategoryOptions = finance.subCategory && !hasCurrentSubCategory
    ? [{ name: finance.subCategory }, ...rawSubCategories]
    : rawSubCategories;

  return (
    <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2">
      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Monto</span>
        <input
          type="number"
          value={finance.amount}
          onChange={(event) => onUpdateFinance(action.id, { amount: Number(event.target.value || 0) })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Moneda</span>
        <select
          value={finance.currency}
          onChange={(event) => onUpdateFinance(action.id, { currency: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        >
          {['ARS', 'USD', 'EUR'].map(currency => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Categoria</span>
        <select
          value={finance.category}
          onChange={(event) => onUpdateFinance(action.id, { category: event.target.value, subCategory: '', subSubCategory: '' })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        >
          <option value="">Elegir</option>
          {categoryOptions.map(category => <option key={category.id || category.name} value={category.name}>{category.name}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Subcategoria</span>
        <select
          value={finance.subCategory || ''}
          onChange={(event) => onUpdateFinance(action.id, {
            subCategory: event.target.value,
            travelCategory: finance.category === 'Viajes' ? event.target.value : finance.travelCategory,
            subSubCategory: '',
          })}
          disabled={!finance.category || subCategoryOptions.length === 0}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none disabled:text-neutral-300"
        >
          <option value="">Sin subcategoria</option>
          {subCategoryOptions.map((sub: any) => {
            const name = typeof sub === 'string' ? sub : sub.name;
            return <option key={name} value={name}>{name}</option>;
          })}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
          {finance.type === 'transfer' ? 'Cuenta origen' : 'Cuenta'}
        </span>
        <select
          value={finance.accountId || ''}
          onChange={(event) => {
            const account = accounts.find(item => item.id === event.target.value);
            onUpdateFinance(action.id, {
              accountId: account?.id || '',
              accountName: account?.name || '',
              needsReview: !account?.id,
              paymentMethod: account?.name || finance.paymentMethod,
            });
          }}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        >
          <option value="">Sin cuenta</option>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency || 'ARS'})</option>)}
        </select>
      </label>

      {finance.type === 'transfer' && (
        <label className="space-y-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Cuenta destino</span>
          <select
            value={finance.toAccountId || ''}
            onChange={(event) => {
              const account = accounts.find(item => item.id === event.target.value);
              onUpdateFinance(action.id, {
                toAccountId: account?.id || '',
                toAccountName: account?.name || '',
                needsReview: !(finance.accountId && account?.id),
              });
            }}
            className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
          >
            <option value="">Sin destino</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency || 'ARS'})</option>)}
          </select>
        </label>
      )}

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Fecha</span>
        <input
          type="date"
          value={finance.date}
          onChange={(event) => onUpdateFinance(action.id, { date: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1 sm:col-span-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Descripcion</span>
        <input
          type="text"
          value={finance.description}
          onChange={(event) => onUpdateFinance(action.id, { description: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>
    </div>
  );
}

function createLocalDate(dateValue?: string) {
  if (!dateValue) return new Date();
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12, 0, 0);
}

function LuzWishlistEditor({
  action,
  onUpdateWishlist,
}: {
  action: LuzAction;
  onUpdateWishlist: (actionId: string, wishlistUpdates: Partial<NonNullable<LuzAction['wishlist']>>) => void;
}) {
  const wishlist = action.wishlist;
  if (!wishlist) return null;

  return (
    <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2">
      <label className="space-y-1 sm:col-span-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Item</span>
        <input
          type="text"
          value={wishlist.title}
          onChange={(event) => onUpdateWishlist(action.id, { title: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Valor estimado</span>
        <input
          type="number"
          value={wishlist.estimatedPrice}
          onChange={(event) => onUpdateWishlist(action.id, { estimatedPrice: Number(event.target.value || 0), needsReview: Number(event.target.value || 0) <= 0 })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Moneda</span>
        <select
          value={wishlist.currency}
          onChange={(event) => onUpdateWishlist(action.id, { currency: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        >
          {['ARS', 'USD', 'EUR'].map(currency => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Categoria</span>
        <select
          value={wishlist.category}
          onChange={(event) => onUpdateWishlist(action.id, { category: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        >
          {['Ropa', 'Tecnologia', 'Casa', 'Viajes', 'Deporte', 'Hobby', 'Experiencias', 'Patrimonio', 'Otros'].map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Tipo</span>
        <select
          value={wishlist.itemType}
          onChange={(event) => onUpdateWishlist(action.id, { itemType: event.target.value as any, horizon: event.target.value === 'big_goal' || event.target.value === 'asset' ? 'long' : wishlist.horizon })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        >
          <option value="purchase">Compra</option>
          <option value="big_goal">Objetivo grande</option>
          <option value="experience">Experiencia</option>
          <option value="asset">Patrimonial</option>
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Horizonte</span>
        <select
          value={wishlist.horizon}
          onChange={(event) => onUpdateWishlist(action.id, { horizon: event.target.value as any })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        >
          <option value="short">Corto plazo</option>
          <option value="medium">Mediano plazo</option>
          <option value="long">Largo plazo</option>
          <option value="open">Sin fecha</option>
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Visibilidad</span>
        <select
          value={wishlist.visibility}
          onChange={(event) => onUpdateWishlist(action.id, { visibility: event.target.value as any, owner: event.target.value === 'private' ? 'agustin' : 'shared' })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        >
          <option value="private">Privado</option>
          <option value="shared_with_partner">Con Vicky</option>
          <option value="household_shared">Compartido</option>
        </select>
      </label>

      <label className="space-y-1 sm:col-span-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Motivo</span>
        <input
          type="text"
          value={wishlist.reason}
          onChange={(event) => onUpdateWishlist(action.id, { reason: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>
    </div>
  );
}

function LuzGoalEditor({
  action,
  onUpdateGoal,
}: {
  action: LuzAction;
  onUpdateGoal: (actionId: string, goalUpdates: Partial<NonNullable<LuzAction['goal']>>) => void;
}) {
  const goal = action.goal;
  if (!goal) return null;

  return (
    <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2">
      <label className="space-y-1 sm:col-span-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Objetivo</span>
        <input
          type="text"
          value={goal.title}
          onChange={(event) => onUpdateGoal(action.id, { title: event.target.value, needsReview: !event.target.value.trim() })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Año</span>
        <input
          type="number"
          value={goal.year}
          onChange={(event) => onUpdateGoal(action.id, { year: Number(event.target.value || new Date().getFullYear()) })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Categorias</span>
        <input
          type="text"
          value={goal.categories.join(', ')}
          onChange={(event) => onUpdateGoal(action.id, { categories: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1 sm:col-span-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Descripcion</span>
        <input
          type="text"
          value={goal.description}
          onChange={(event) => onUpdateGoal(action.id, { description: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>
    </div>
  );
}

function LuzHabitEditor({
  action,
  onUpdateHabit,
}: {
  action: LuzAction;
  onUpdateHabit: (actionId: string, habitUpdates: Partial<NonNullable<LuzAction['habit']>>) => void;
}) {
  const habit = action.habit;
  if (!habit) return null;

  return (
    <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2">
      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Habito</span>
        <input
          type="text"
          value={habit.title}
          onChange={(event) => onUpdateHabit(action.id, { title: event.target.value, needsReview: !event.target.value.trim() })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Inicio</span>
        <input
          type="date"
          value={habit.startDate}
          onChange={(event) => onUpdateHabit(action.id, { startDate: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>

      <label className="space-y-1 sm:col-span-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Descripcion</span>
        <input
          type="text"
          value={habit.description}
          onChange={(event) => onUpdateHabit(action.id, { description: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-neutral-950 outline-none"
        />
      </label>
    </div>
  );
}
