import { useEffect, useMemo, useState } from 'react';
import { Brain, CalendarDays, CheckCircle2, Loader2, Search, Send, Sparkles, Wallet } from 'lucide-react';
import { collection, db, onSnapshot, orderBy, query, where } from '../firebase';
import { answerWithLocalMemory, toLuzMemoryRecords, type LuzAnswer, type LuzMemoryRecord } from '../features/luz/luzAnalysis';

interface LuzWorkspaceProps {
  user: {
    uid: string;
    householdId?: string | null;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'luz';
  text: string;
  answer?: LuzAnswer;
}

const SUGGESTED_QUESTIONS = [
  'Que tema vengo repitiendo y todavia no resolvi?',
  'Cuantas veces mencione sumar a alguien comercial?',
  'Que objetivos no tienen habitos que los sostengan?',
  'Que gastos aparecen conectados con ocio o salidas?',
];

export default function LuzWorkspace({ user }: LuzWorkspaceProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thoughts, setThoughts] = useState<any[]>([]);
  const [finances, setFinances] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);

  useEffect(() => {
    const unsubThoughts = onSnapshot(
      query(collection(db, 'thoughts'), where('uid', '==', user.uid), orderBy('timestamp', 'desc')),
      snapshot => setThoughts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
    );
    const unsubGoals = onSnapshot(
      query(collection(db, 'goals'), where('uid', '==', user.uid)),
      snapshot => setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
    );
    const unsubHabits = onSnapshot(
      query(collection(db, 'habits'), where('uid', '==', user.uid)),
      snapshot => setHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
    );
    const unsubFinances = onSnapshot(
      query(collection(db, 'finances'), where('householdId', '==', user.householdId || `personal-${user.uid}`), orderBy('date', 'desc')),
      snapshot => setFinances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
    );

    return () => {
      unsubThoughts();
      unsubGoals();
      unsubHabits();
      unsubFinances();
    };
  }, [user.uid, user.householdId]);

  const memory = useMemo(
    () => toLuzMemoryRecords({ thoughts, finances, goals, habits }),
    [thoughts, finances, goals, habits],
  );

  const stats = [
    { label: 'Diario', value: thoughts.length, icon: <Brain size={16} /> },
    { label: 'Finanzas', value: finances.length, icon: <Wallet size={16} /> },
    { label: 'Habitos', value: habits.length, icon: <CheckCircle2 size={16} /> },
    { label: 'Objetivos', value: goals.length, icon: <CalendarDays size={16} /> },
  ];

  const askLuz = (value = question) => {
    const cleanQuestion = value.trim();
    if (!cleanQuestion || isThinking) return;

    setIsThinking(true);
    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      text: cleanQuestion,
    };
    const answer = answerWithLocalMemory(cleanQuestion, memory);
    const luzMessage: ChatMessage = {
      id: createMessageId('luz'),
      role: 'luz',
      text: answer.summary,
      answer,
    };

    setMessages(prev => [...prev, userMessage, luzMessage]);
    setQuestion('');
    setIsThinking(false);
  };

  return (
    <div className="grid min-h-[calc(100vh-5rem)] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-h-[680px] flex-col rounded-[2rem] bg-neutral-950 p-4 text-white shadow-sm md:p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Luz</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-4xl">Preguntar</h2>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/45">
            Base local
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[360px] flex-col justify-end">
              <div className="grid gap-2 md:grid-cols-2">
                {SUGGESTED_QUESTIONS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => askLuz(item)}
                    className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-left text-sm font-bold leading-5 text-white/72 transition hover:bg-white/[0.1] hover:text-white"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            askLuz();
          }}
          className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-3"
        >
          <textarea
            value={question}
            onChange={event => setQuestion(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                askLuz();
              }
            }}
            placeholder="Preguntale a Luz..."
            className="min-h-24 w-full resize-none rounded-[1.25rem] border border-white/10 bg-white p-4 text-base font-medium leading-7 text-neutral-950 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-white/25"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-white/35">{memory.length} registros disponibles</p>
            <button
              type="submit"
              disabled={!question.trim() || isThinking}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-xs font-black uppercase tracking-widest text-neutral-950 transition hover:bg-neutral-100 disabled:opacity-40"
            >
              {isThinking ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              Enviar
            </button>
          </div>
        </form>
      </section>

      <aside className="grid content-start gap-5">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Contexto</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {stats.map(stat => (
              <div key={stat.label} className="rounded-2xl bg-neutral-50 p-3">
                <div className="mb-2 text-neutral-400">{stat.icon}</div>
                <p className="text-2xl font-black text-neutral-950">{stat.value}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Como responde</p>
          <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-neutral-600">
            <p>Usa solo registros que ya existen.</p>
            <p>Si no encuentra evidencia suficiente, lo dice.</p>
            <p>Esta base se reemplazara por IA real con fuentes y permisos.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-3xl rounded-[1.5rem] p-4 ${isUser ? 'bg-white text-neutral-950' : 'border border-white/10 bg-white/[0.07] text-white'}`}>
        <div className="mb-2 flex items-center gap-2">
          {!isUser && <Sparkles size={14} className="text-white/45" />}
          <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-45">{isUser ? 'Vos' : 'Luz'}</p>
        </div>
        <p className="text-sm font-bold leading-6">{message.text}</p>
        {message.answer && (
          <div className="mt-4 space-y-3">
            {message.answer.bullets.map((bullet, index) => (
              <p key={`${bullet}-${index}`} className="rounded-2xl bg-black/15 p-3 text-sm font-semibold leading-6 text-white/70">
                {bullet}
              </p>
            ))}
            {message.answer.sources.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Fuentes</p>
                {message.answer.sources.map(source => (
                  <SourceCard key={`${source.type}-${source.id}`} source={source} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ source }: { source: LuzMemoryRecord }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-widest text-white/45">{source.type}</p>
        {source.date && <p className="text-[11px] font-semibold text-white/35">{source.date.toLocaleDateString('es-AR')}</p>}
      </div>
      <p className="text-sm font-black text-white">{source.title}</p>
      <p className="mt-1 line-clamp-3 text-xs font-semibold leading-5 text-white/58">{source.body}</p>
    </div>
  );
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
