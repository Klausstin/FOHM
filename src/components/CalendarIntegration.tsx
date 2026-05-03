import React, { useEffect, useState } from 'react';
import { AlertCircle, Calendar, CalendarCheck, CheckCircle2, Clock, ExternalLink, LogOut, RefreshCw, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { getGoogleAuthUrl, getCalendarEvents, CalendarEvent } from '../services/calendarService.ts';
import { analyzeCalendarAndSuggest } from '../services/gemini.ts';
import { db, doc, getDoc, setDoc, deleteDoc } from '../firebase.ts';
import PageHeader from './ui/PageHeader.tsx';
import EmptyState from './ui/EmptyState.tsx';
import Button from './ui/Button.tsx';

interface CalendarIntegrationProps {
  user: any;
  habits: any[];
  goals: any[];
  thoughts: any[];
}

export default function CalendarIntegration({ user, habits, goals, thoughts }: CalendarIntegrationProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedEvents = await getCalendarEvents(user.uid);
      setEvents(fetchedEvents);
    } catch (err: any) {
      console.error('Error fetching events:', err);
      setError(err.message || 'Error al obtener eventos del calendario.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { tokens, uid } = event.data;
        if (tokens && uid) {
          try {
            const tokenRef = doc(db, 'google_tokens', uid);
            const existingDoc = await getDoc(tokenRef);

            const finalTokens = existingDoc.exists()
              ? { ...existingDoc.data()?.tokens, ...tokens }
              : tokens;

            await setDoc(tokenRef, {
              tokens: finalTokens,
              updatedAt: new Date(),
            });

            fetchEvents();
          } catch (err) {
            console.error('Error saving tokens to Firestore:', err);
            setError('Error al guardar la conexión con Google.');
          }
        } else {
          fetchEvents();
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user.uid]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const url = await getGoogleAuthUrl(user.uid);
      window.open(url, 'google_oauth_popup', 'width=600,height=700');
    } catch (err) {
      console.error('Error connecting to Google Calendar:', err);
      setError('Error al conectar con Google Calendar.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Estás seguro de que querés desconectar Google Calendar?')) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'google_tokens', user.uid));
      setEvents([]);
      setAnalysis(null);
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Error al desconectar Google Calendar.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (events.length === 0) return;

    setIsAnalyzing(true);
    try {
      const result = await analyzeCalendarAndSuggest(events, habits, goals, thoughts);
      setAnalysis(result);
    } catch (err) {
      console.error('Error analyzing calendar:', err);
      setError('Error al analizar el calendario.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isConnected = events.length > 0 || loading;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendario"
        title="Google Calendar"
        description="Sincronizá tu tiempo con tus objetivos y hábitos."
        actions={!isConnected ? (
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            icon={isConnecting ? <RefreshCw className="animate-spin" size={18} /> : <ExternalLink size={18} />}
          >
            Conectar Google Calendar
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || events.length === 0}
              icon={isAnalyzing ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
            >
              Analizar agenda
            </Button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="rounded-2xl p-3 text-neutral-400 transition-all hover:bg-red-50 hover:text-red-500"
              title="Desconectar cuenta"
            >
              <LogOut size={20} />
            </button>
          </div>
        )}
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-600">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <h3 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
            <Clock size={20} className="text-neutral-400" />
            Próximos eventos
          </h3>

          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
              ))
            ) : events.length > 0 ? (
              events.slice(0, 10).map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <h4 className="truncate text-sm font-bold text-neutral-900">{event.summary}</h4>
                  <p className="mt-1 text-xs text-neutral-500">
                    {event.start.dateTime
                      ? new Date(event.start.dateTime).toLocaleString()
                      : event.start.date}
                  </p>
                </motion.div>
              ))
            ) : (
              <EmptyState
                icon={<CalendarCheck size={32} />}
                title="Sin eventos"
                description="No hay eventos o el calendario todavía no está conectado."
              />
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center space-y-4 rounded-[2.5rem] border border-neutral-100 bg-white p-12 text-center"
              >
                <div className="flex h-16 w-16 animate-bounce items-center justify-center rounded-3xl bg-neutral-900 text-white">
                  <Sparkles size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-neutral-900">Analizando tu tiempo...</h3>
                  <p className="text-neutral-500">La IA está revisando tu calendario y tus metas.</p>
                </div>
              </motion.div>
            ) : analysis ? (
              <motion.div
                key="analysis"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[2.5rem] bg-neutral-900 p-8 text-white shadow-2xl md:p-12"
              >
                <div className="absolute right-0 top-0 p-8 opacity-10">
                  <Sparkles size={120} />
                </div>
                <div className="relative z-10">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                      <CheckCircle2 size={24} className="text-white" />
                    </div>
                    <h3 className="text-2xl font-bold">Sugerencias de IA</h3>
                  </div>

                  <div className="prose prose-invert max-w-none prose-p:text-neutral-300 prose-headings:text-white prose-strong:text-white">
                    <ReactMarkdown>{analysis}</ReactMarkdown>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAnalysis(null)}
                    className="mt-8 text-sm font-bold text-neutral-400 transition-colors hover:text-white"
                  >
                    Cerrar análisis
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center space-y-4 rounded-[2.5rem] border border-neutral-100 bg-white p-12 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-neutral-50 text-neutral-300">
                  <Calendar size={32} />
                </div>
                <div className="max-w-xs">
                  <h3 className="text-xl font-bold text-neutral-900">Optimizá tu agenda</h3>
                  <p className="text-neutral-500">Conectá tu calendario para recibir sugerencias personalizadas basadas en tus hábitos y objetivos.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
