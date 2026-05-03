import { useMemo, useState } from 'react';
import { Mic, Send, Sparkles, Wallet, Brain, Loader2 } from 'lucide-react';
import { createFinancialTransaction } from '../features/finance/finance.service';
import { createJournalEntry } from '../features/journal/journal.service';
import { routeLuzMessage } from '../features/luz/luzRouter';

interface LuzCommandCenterProps {
  user: {
    uid: string;
    householdId?: string | null;
  };
}

export default function LuzCommandCenter({ user }: LuzCommandCenterProps) {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const preview = useMemo(() => {
    if (!message.trim()) return null;
    return routeLuzMessage(message);
  }, [message]);

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!message.trim() || isSaving) return;

    const route = routeLuzMessage(message);
    setIsSaving(true);
    setStatus(null);
    setFollowUpQuestions([]);

    try {
      if (route.type === 'finance' && route.finance) {
        await createFinancialTransaction({
          uid: user.uid,
          householdId: user.householdId || `personal-${user.uid}`,
          amount: route.finance.amount,
          currency: route.finance.currency,
          description: route.finance.description,
          note: message.trim(),
          category: route.finance.category,
          type: route.finance.type,
          date: new Date(),
          source: 'manual',
          confidence: route.confidence === 'high' ? 'exact' : 'inferred',
          status: route.confidence === 'high' ? 'posted' : 'needs_review',
          needsReview: route.confidence !== 'high',
          isConfirmed: route.confidence === 'high',
          generatedBy: user.uid,
          assignedTo: user.uid,
          paymentStatus: route.confidence === 'high' ? 'Contabilizado' : 'Pendiente de revisar',
        });
      } else {
        await createJournalEntry({
          uid: user.uid,
          householdId: user.householdId || null,
          content: route.journalContent || message.trim(),
          categories: ['yo'],
        });
      }

      setStatus(route.summary);
      setFollowUpQuestions(getFollowUpQuestions(message, route.type));
      setMessage('');
    } catch (error) {
      console.error('Luz no pudo guardar la entrada:', error);
      setStatus('No pude guardar esto todavia. Probemos de nuevo o cargalo desde la pantalla especifica.');
    } finally {
      setIsSaving(false);
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

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.08] p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
            <Sparkles size={13} />
            Hablar con Luz
          </p>
          <p className="mt-1 text-sm font-medium text-white/60">
            Escribi o dicta. Luz ordena la informacion y te pregunta lo minimo necesario para completar el registro.
          </p>
        </div>
        {preview && (
          <span className="hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-900 sm:inline-flex">
            {preview.type === 'finance' ? <Wallet size={13} /> : <Brain size={13} />}
            {preview.type === 'finance' ? 'Finanzas' : 'Diario'}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder='Ej: "Gaste 50 mil pesos en el cine" o "Hoy me senti trabado con el trabajo"'
          className="min-h-28 w-full resize-none rounded-[1.25rem] border border-white/10 bg-white text-sm font-medium leading-6 text-neutral-900 outline-none p-4 placeholder:text-neutral-400 focus:ring-2 focus:ring-white/30"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-6 text-xs font-semibold text-white/62">
            {status || preview?.summary || 'Luz te ayuda a ver patrones, contradicciones y proximos pasos.'}
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
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              Guardar
            </button>
          </div>
        </div>
      </form>

      {followUpQuestions.length > 0 && (
        <div className="mt-4 space-y-2 rounded-[1.25rem] border border-white/10 bg-black/15 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Luz podria completar esto</p>
          <div className="grid gap-2 md:grid-cols-2">
            {followUpQuestions.map(question => (
              <button
                key={question}
                type="button"
                onClick={() => setMessage(question)}
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-xs font-semibold leading-5 text-white/78 transition hover:bg-white/15"
              >
                {question}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFollowUpQuestions([])}
            className="text-xs font-bold text-white/40 transition hover:text-white/70"
          >
            Ignorar por ahora
          </button>
        </div>
      )}
    </div>
  );
}

function getFollowUpQuestions(message: string, type: 'finance' | 'journal') {
  const normalized = message.toLowerCase();
  const questions: string[] = [];

  if (type === 'finance') {
    questions.push('Con que cuenta, tarjeta o billetera lo pagaste?');
  }

  if (normalized.includes('cine') || normalized.includes('pelicula') || normalized.includes('película')) {
    questions.push('Te gusto la pelicula? Que puntaje le pondrias y que te quedo dando vueltas?');
  }

  if (type === 'journal' && questions.length === 0) {
    questions.push('Queres agregar que emocion predominaba y que accion concreta te conviene tomar?');
  }

  return questions.slice(0, 2);
}
