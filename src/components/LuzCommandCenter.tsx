import { useMemo, useState } from 'react';
import { Brain, CheckCircle2, HelpCircle, Loader2, Mic, Send, Sparkles, Wallet, X } from 'lucide-react';
import { createFinancialTransaction } from '../features/finance/finance.service';
import { createHabitLog } from '../features/habits/habit.service';
import type { HabitRecord } from '../features/habits/habit.types';
import { createJournalEntry } from '../features/journal/journal.service';
import { routeLuzMessage, type LuzAction, type LuzFinancialAccountOption, type LuzRouteResult } from '../features/luz/luzRouter';

interface LuzCommandCenterProps {
  user: {
    uid: string;
    householdId?: string | null;
  };
  habits?: HabitRecord[];
  accounts?: LuzFinancialAccountOption[];
}

export default function LuzCommandCenter({ user, habits = [], accounts = [] }: LuzCommandCenterProps) {
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<LuzRouteResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const preview = useMemo(() => {
    if (!message.trim()) return null;
    return routeLuzMessage(message, habits, accounts);
  }, [message, habits, accounts]);

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!message.trim() || isSaving) return;

    const nextDraft = routeLuzMessage(message, habits, accounts);
    setDraft(nextDraft);
    setStatus(nextDraft.summary);
  };

  const confirmDraft = async () => {
    if (!draft || isSaving) return;

    const executableActions = draft.actions.filter(action => action.type !== 'ask_follow_up');
    if (executableActions.length === 0) {
      setStatus('No hay acciones listas para guardar. Respondeme una de las preguntas o cargalo manualmente.');
      return;
    }

    setIsSaving(true);
    try {
      for (const action of executableActions) {
        await executeAction(action);
      }
      setStatus(`Guardado: ${executableActions.length} accion(es). Lo incompleto queda para revisar.`);
      setDraft(null);
      setMessage('');
    } catch (error) {
      console.error('Luz no pudo guardar la entrada:', error);
      setStatus('No pude guardar esto todavia. Probemos de nuevo o cargalo desde la pantalla especifica.');
    } finally {
      setIsSaving(false);
    }
  };

  const executeAction = async (action: LuzAction) => {
    if (action.type === 'create_finance_transaction' && action.finance) {
      await createFinancialTransaction({
        uid: user.uid,
        householdId: user.householdId || `personal-${user.uid}`,
        amount: action.finance.amount,
        currency: action.finance.currency,
        description: action.finance.description,
        note: message.trim(),
        category: action.finance.category,
        type: action.finance.type,
        accountId: action.finance.accountId || '',
        date: new Date(),
        source: 'manual',
        confidence: action.confidence === 'high' ? 'exact' : 'inferred',
        status: action.finance.needsReview ? 'needs_review' : 'posted',
        needsReview: action.finance.needsReview,
        isConfirmed: !action.finance.needsReview,
        generatedBy: user.uid,
        assignedTo: user.uid,
        paymentType: action.finance.paymentMethod || '',
        paymentStatus: action.finance.needsReview ? 'Pendiente de revisar' : 'Contabilizado',
      });
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
  const previewType = currentActions.some(action => action.type === 'create_finance_transaction')
    ? 'Finanzas'
    : currentActions.some(action => action.type === 'create_habit_checkin')
      ? 'Habitos'
      : 'Diario';

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.08] p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
            <Sparkles size={13} />
            Luz
          </p>
        </div>
        {currentActions.length > 0 && (
          <span className="hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-900 sm:inline-flex">
            {previewType === 'Finanzas' ? <Wallet size={13} /> : previewType === 'Habitos' ? <CheckCircle2 size={13} /> : <Brain size={13} />}
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
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Escribi o dicta..."
          className="min-h-40 w-full resize-none rounded-[1.25rem] border border-white/10 bg-white p-4 text-base font-medium leading-7 text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-white/30"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-6 text-xs font-semibold text-white/62">
            {status || preview?.summary || ''}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startDictation}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 transition ${isListening ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/15'}`}
              title="Dictar"
            >
              <Mic size={18} />
            </button>
            <button
              type="submit"
              disabled={!message.trim() || isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-xs font-black uppercase tracking-widest text-neutral-950 transition hover:bg-neutral-100 disabled:opacity-45"
            >
              <Send size={16} />
              Enviar
            </button>
          </div>
        </div>
      </form>

      {draft && (
        <div className="mt-4 space-y-3 rounded-[1.25rem] border border-white/10 bg-black/15 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Antes de guardar</p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {draft.actions.map(action => (
              <LuzActionCard key={action.id} action={action} />
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-2xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              Editar y reinterpretar
            </button>
            <button
              type="button"
              onClick={confirmDraft}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-neutral-950 transition hover:bg-neutral-100 disabled:opacity-45"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Confirmar acciones
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LuzActionCard({ action }: { action: LuzAction }) {
  const Icon = action.type === 'create_finance_transaction'
    ? Wallet
    : action.type === 'create_habit_checkin'
      ? CheckCircle2
      : action.type === 'ask_follow_up'
        ? HelpCircle
        : Brain;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-neutral-950">
          <Icon size={16} />
        </div>
        <div>
          <p className="text-sm font-black text-white">{action.title}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{action.confidence}</p>
        </div>
      </div>
      <p className="text-xs font-medium leading-5 text-white/68">{action.detail}</p>
    </div>
  );
}
