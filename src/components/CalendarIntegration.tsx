import React, { useState, useEffect } from 'react';
import { Calendar, CalendarCheck, Clock, RefreshCw, ExternalLink, Sparkles, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getGoogleAuthUrl, getCalendarEvents, CalendarEvent } from '../services/calendarService.ts';
import { analyzeCalendarAndSuggest } from '../services/gemini.ts';
import ReactMarkdown from 'react-markdown';
import { db, doc, getDoc, setDoc, deleteDoc } from '../firebase.ts';

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
            // Store tokens in Firestore from the client side to bypass server-side permission issues
            const tokenRef = doc(db, 'google_tokens', uid);
            const existingDoc = await getDoc(tokenRef);
            
            let finalTokens = tokens;
            if (existingDoc.exists()) {
              const existingData = existingDoc.data();
              finalTokens = {
                ...existingData?.tokens,
                ...tokens
              };
            }

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
    if (!confirm('¿Estás seguro de que quieres desconectar Google Calendar?')) return;
    setLoading(true);
    try {
      // Delete from Firestore on the client side to bypass server-side permission issues
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
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3">
            <Calendar className="text-neutral-900" size={32} />
            Google Calendar
          </h2>
          <p className="text-neutral-500 font-medium">Sincroniza tu tiempo con tus objetivos y hábitos.</p>
        </div>
        
        {!isConnected ? (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200 disabled:opacity-50"
          >
            {isConnecting ? <RefreshCw className="animate-spin" size={18} /> : <ExternalLink size={18} />}
            Conectar Google Calendar
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || events.length === 0}
              className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200 disabled:opacity-50"
            >
              {isAnalyzing ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
              Analizar y Sugerir Espacios
            </button>
            <button
              onClick={handleDisconnect}
              className="p-3 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
              title="Desconectar cuenta"
            >
              <LogOut size={20} />
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Events List */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <Clock size={20} className="text-neutral-400" />
            Próximos Eventos
          </h3>
          
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 bg-neutral-100 animate-pulse rounded-2xl" />
              ))
            ) : events.length > 0 ? (
              events.slice(0, 10).map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  <h4 className="font-bold text-neutral-900 text-sm truncate">{event.summary}</h4>
                  <p className="text-xs text-neutral-500 mt-1">
                    {event.start.dateTime 
                      ? new Date(event.start.dateTime).toLocaleString()
                      : event.start.date}
                  </p>
                </motion.div>
              ))
            ) : (
              <div className="bg-neutral-50 p-8 rounded-3xl border border-dashed border-neutral-200 text-center">
                <CalendarCheck className="mx-auto text-neutral-300 mb-3" size={40} />
                <p className="text-neutral-500 text-sm font-medium">No hay eventos o calendario no conectado.</p>
              </div>
            )}
          </div>
        </div>

        {/* Analysis & Suggestions */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white p-12 rounded-[2.5rem] border border-neutral-100 flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="w-16 h-16 bg-neutral-900 rounded-3xl flex items-center justify-center text-white animate-bounce">
                  <Sparkles size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-neutral-900">Analizando tu tiempo...</h3>
                  <p className="text-neutral-500">Gemini está revisando tu calendario y tus metas.</p>
                </div>
              </motion.div>
            ) : analysis ? (
              <motion.div
                key="analysis"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-neutral-900 text-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Sparkles size={120} />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                      <CheckCircle2 size={24} className="text-white" />
                    </div>
                    <h3 className="text-2xl font-bold">Sugerencias de Gemini</h3>
                  </div>
                  
                  <div className="prose prose-invert max-w-none prose-p:text-neutral-300 prose-headings:text-white prose-strong:text-white">
                    <ReactMarkdown>{analysis}</ReactMarkdown>
                  </div>

                  <button
                    onClick={() => setAnalysis(null)}
                    className="mt-8 text-neutral-400 hover:text-white font-bold text-sm transition-colors"
                  >
                    Cerrar Análisis
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white p-12 rounded-[2.5rem] border border-neutral-100 flex flex-col items-center justify-center text-center space-y-4 h-full"
              >
                <div className="w-16 h-16 bg-neutral-50 rounded-3xl flex items-center justify-center text-neutral-300">
                  <Calendar size={32} />
                </div>
                <div className="max-w-xs">
                  <h3 className="text-xl font-bold text-neutral-900">Optimiza tu Agenda</h3>
                  <p className="text-neutral-500">Conecta tu calendario para recibir sugerencias personalizadas basadas en tus hábitos y objetivos.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
