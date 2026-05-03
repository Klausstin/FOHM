import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType } from '../firebase.ts';
import { Brain, Mic, Send, Trash2, Filter, Sparkles, MessageSquare, History, Image, Loader2, X, Tag, CheckCircle2, User as UserIcon } from 'lucide-react';
import { MIND_CATEGORIES } from '../lib/mindCategories.ts';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { analyzeMentalConsistency, transcribeAudio, analyzeImage, categorizeThought, checkHabitProgress } from '../services/gemini.ts';
import { DEFAULT_PRIVATE_VISIBILITY, VISIBILITY_LABELS } from '../domain/permissions.ts';
import { buildFinalJournalContent, EMPTY_REFLECTION, REFLECTION_PRODUCTIVITY_OPTIONS } from '../features/journal/journal.helpers.ts';
import { createJournalEntry, subscribeToUserJournalEntries } from '../features/journal/journal.service.ts';
import type { JournalEntryRecord, JournalReflection, SelectedJournalImage } from '../features/journal/journal.types.ts';


export default function MindTracker({ user }: { user: any }) {
  const [thoughts, setThoughts] = useState<JournalEntryRecord[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [activeHabits, setActiveHabits] = useState<any[]>([]);
  const [members, setMembers] = useState<{ [key: string]: any }>({});
  const [newThought, setNewThought] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [habitFeedback, setHabitFeedback] = useState<string | null>(null);
  
  // Guided Reflection State
  const [showReflection, setShowReflection] = useState(false);
  const [reflection, setReflection] = useState<JournalReflection>(EMPTY_REFLECTION);

  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedJournalImage | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Members are kept only for legacy entries that may already exist.
    const qMembers = query(collection(db, 'users'), where('householdId', '==', user.householdId));
    const unsubMembers = onSnapshot(qMembers, (snap) => {
      const memberMap: { [key: string]: any } = {};
      snap.docs.forEach(doc => {
        memberMap[doc.id] = doc.data();
      });
      setMembers(memberMap);
    });

    const unsubscribe = subscribeToUserJournalEntries(user.uid, setThoughts, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'thoughts');
    });

    const qGoals = query(collection(db, 'goals'), where('uid', '==', user.uid), where('year', '==', 2026));
    const unsubGoals = onSnapshot(qGoals, (snap) => {
      setGoals(snap.docs.map(doc => doc.data()));
    });

    const qHabits = query(
      collection(db, 'habits'), 
      where('uid', '==', user.uid), 
      where('status', '==', 'active')
    );
    const unsubHabits = onSnapshot(qHabits, (snap) => {
      setActiveHabits(snap.docs.map(doc => doc.data()));
    });

    return () => {
      unsubscribe();
      unsubGoals();
      unsubHabits();
      unsubMembers();
    };
  }, [user.uid, user.householdId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newThought.trim() && !selectedImage) return;

    setIsAnalyzingImage(true);
    setIsCategorizing(true);
    try {
      let imageAnalysis = "";
      if (selectedImage) {
        imageAnalysis = await analyzeImage(selectedImage.data, selectedImage.type, newThought || "Analiza esta imagen.");
      }

      const finalContent = buildFinalJournalContent(newThought, reflection, showReflection);

      if (!finalContent.trim() && !selectedImage) return;

      // Automatic categorization keeps manual tags as the source of truth when present.
      let categories = selectedCategories;
      if (categories.length === 0 && finalContent.trim()) {
        const geminiLabels = await categorizeThought(finalContent, MIND_CATEGORIES);
        // Translate labels back to IDs for consistency.
        categories = geminiLabels.map(label => {
          const searchLabel = label.trim().toLowerCase();
          const cat = MIND_CATEGORIES.find(c => 
            searchLabel === c.label.toLowerCase() || 
            searchLabel === c.id.toLowerCase() ||
            searchLabel.includes(c.label.toLowerCase())
          );
          return cat ? cat.id : label;
        });
      }
      if (categories.length === 0) categories = [MIND_CATEGORIES[0].id];

      const feedback = await checkHabitProgress(finalContent, activeHabits);
      if (feedback) {
        setHabitFeedback(feedback);
        setTimeout(() => setHabitFeedback(null), 10000);
      }

      await createJournalEntry({
        uid: user.uid,
        householdId: user.householdId || null,
        content: finalContent,
        categories,
        image: selectedImage,
        imageAnalysis: imageAnalysis || null,
      });
      setNewThought('');
      setSelectedImage(null);
      setSelectedCategories([]);
      setReflection({ ...EMPTY_REFLECTION });
      setShowReflection(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'thoughts');
    } finally {
      setIsAnalyzingImage(false);
      setIsCategorizing(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string)?.split(',')?.[1];
        setSelectedImage({ data: base64String, type: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string)?.split(',')?.[1];
            const transcription = await transcribeAudio(base64Audio, audioBlob.type);
            setNewThought(prev => prev ? `${prev}\n${transcription}` : transcription);
          };
          reader.readAsDataURL(audioBlob);
        } catch (err) {
          console.error("Transcription failed:", err);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  const runAnalysis = async () => {
    if (thoughts.length < 3) {
      alert("Agrega al menos 3 entradas para analizar consistencia.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await analyzeMentalConsistency(thoughts.slice(0, 20), goals);
      setAnalysisResult(result);
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredThoughts = useMemo(() => {
    if (!filterCategory) return thoughts;
    
    const targetCat = MIND_CATEGORIES.find(cat => cat.id === filterCategory);
    if (!targetCat) return thoughts;

    const targetId = targetCat.id.toLowerCase();
    const targetLabel = targetCat.label.toLowerCase();

    return thoughts.filter(t => {
      if (!t.categories || !Array.isArray(t.categories)) return false;
      return t.categories.some((c: string) => {
        if (!c || typeof c !== 'string') return false;
        const search = c.trim().toLowerCase();
        // Exact match with ID or Label, OR the stored item contains the label (handles legacy with emojis)
        return search === targetId || search === targetLabel || search.includes(targetLabel);
      });
    });
  }, [thoughts, filterCategory]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Diario Mental</h2>
          <p className="text-neutral-500 font-medium">Registra pensamientos, energia y patrones para entender tu alineacion.</p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200 disabled:opacity-50"
        >
          {isAnalyzing ? <Sparkles className="animate-spin" size={18} /> : <Sparkles size={18} />}
          Analizar consistencia
        </button>
      </header>

      {analysisResult && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-neutral-900 text-white p-8 rounded-[2rem] shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Brain size={120} />
          </div>
          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Sparkles size={20} className="text-neutral-400" />
              Analisis con IA
            </h3>
            <div className="prose prose-invert max-w-none text-neutral-300 leading-relaxed">
              {analysisResult}
            </div>
            <button 
              onClick={() => setAnalysisResult(null)}
              className="mt-6 text-sm font-bold text-neutral-400 hover:text-white transition-colors"
            >
              Cerrar analisis
            </button>
          </div>
        </motion.div>
      )}

      {habitFeedback && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] shadow-sm flex items-start gap-4"
        >
          <div className="bg-emerald-500 text-white p-2 rounded-full">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h4 className="text-emerald-900 font-bold mb-1">Progreso de habito detectado</h4>
            <p className="text-emerald-700 text-sm">{habitFeedback}</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <MessageSquare size={18} className="text-neutral-400" />
              Nuevo pensamiento
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Categorias</label>
                  <button 
                    type="button"
                    onClick={() => setShowReflection(!showReflection)}
                    className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${
                      showReflection ? 'bg-amber-500 text-white shadow-lg' : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    {showReflection ? 'Cerrar reflexion' : 'Reflexion guiada'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                  {MIND_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategories(prev => 
                          prev.includes(cat.id) 
                            ? prev.filter(id => id !== cat.id)
                            : [...prev, cat.id]
                        );
                      }}
                      className={`flex items-center gap-2 p-2 rounded-xl text-[10px] font-bold transition-all border ${
                        selectedCategories.includes(cat.id) 
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-md' 
                          : 'bg-white text-neutral-500 border-neutral-100 hover:border-neutral-300'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span className="truncate">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <AnimatePresence>
                  {showReflection && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-3 overflow-hidden border-l-2 border-amber-200 pl-4 py-2"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-neutral-400">Que emociones tuviste hoy?</label>
                        <input 
                          type="text" 
                          value={reflection.emotions}
                          onChange={(e) => setReflection({...reflection, emotions: e.target.value})}
                          placeholder="Ej: alegria, nostalgia..."
                          className="w-full text-xs p-2 bg-neutral-50 rounded-lg border-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-neutral-400">Por que te sentiste asi?</label>
                        <textarea 
                          value={reflection.explanation}
                          onChange={(e) => setReflection({...reflection, explanation: e.target.value})}
                          className="w-full text-xs p-2 bg-neutral-50 rounded-lg border-none focus:ring-1 focus:ring-amber-500 h-16 resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-neutral-400">Que fue lo mas importante hoy?</label>
                        <textarea 
                          value={reflection.highlights}
                          onChange={(e) => setReflection({...reflection, highlights: e.target.value})}
                          className="w-full text-xs p-2 bg-neutral-50 rounded-lg border-none focus:ring-1 focus:ring-amber-500 h-16 resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-neutral-400">Hiciste lo que te propusiste?</label>
                        <div className="flex gap-2">
                          {REFLECTION_PRODUCTIVITY_OPTIONS.map(option => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setReflection({...reflection, productivity: option})}
                              className={`text-[9px] px-2 py-1 rounded-lg transition-all ${
                                reflection.productivity === option ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-500'
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative group/input">
                  <textarea
                    value={newThought}
                    onChange={(e) => setNewThought(e.target.value)}
                    placeholder={showReflection ? "Comentarios adicionales..." : "Que tenes en mente?"}
                    className="w-full h-40 bg-neutral-50 border border-neutral-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all resize-none mb-2"
                  />
                  
                  <AnimatePresence>
                    {(isRecording || isTranscribing || isCategorizing) && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-4 z-20"
                      >
                        {isRecording ? (
                          <>
                            <div className="relative">
                              <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20" />
                              <div className="relative bg-red-500 text-white p-4 rounded-full">
                                <Mic size={32} />
                              </div>
                            </div>
                            <p className="text-red-500 font-bold animate-pulse">Grabando audio...</p>
                            <button 
                              type="button"
                              onClick={stopRecording}
                              className="mt-4 bg-neutral-900 text-white px-6 py-2 rounded-full text-sm font-bold"
                            >
                              Detener grabacion
                            </button>
                          </>
                        ) : (
                          <>
                            <Loader2 size={32} className="text-neutral-900 animate-spin" />
                            <p className="text-neutral-900 font-bold">
                              {isTranscribing ? "Transcribiendo audio..." : "Categorizando entrada..."}
                            </p>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {selectedImage && (
                    <div className="absolute top-4 right-4 group">
                      <img 
                        src={`data:${selectedImage.type};base64,${selectedImage.data}`} 
                        alt="Preview" 
                        className="w-20 h-20 object-cover rounded-xl border-2 border-white shadow-lg"
                      />
                      <button 
                        type="button"
                        onClick={() => setSelectedImage(null)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Actions Row - Moved outside to prevent overlap */}
                  <div className="flex items-center justify-between p-1">
                    <div className="flex gap-2">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImageSelect} 
                        accept="image/*" 
                        className="hidden" 
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 bg-neutral-100 text-neutral-500 rounded-full hover:bg-neutral-200 transition-all"
                        title="Agregar imagen"
                      >
                        <Image size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`p-3 rounded-full transition-all ${
                          isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                        }`}
                        title="Grabar audio"
                      >
                        {isTranscribing ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={isAnalyzingImage || (!newThought.trim() && !selectedImage && !showReflection)}
                      className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg disabled:opacity-50"
                    >
                      {isAnalyzingImage ? <Loader2 size={18} className="animate-spin" /> : (
                        <>
                          <span>Enviar</span>
                          <Send size={18} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* List Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <History size={18} className="text-neutral-400" />
              Entradas recientes
            </h3>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-neutral-400" />
              <select 
                value={filterCategory || ''} 
                onChange={(e) => setFilterCategory(e.target.value || null)}
                className="bg-transparent text-sm font-bold text-neutral-500 border-none focus:ring-0 cursor-pointer"
              >
                <option value="">Todas las categorias</option>
                {MIND_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {filteredThoughts.map((thought) => (
                <motion.div
                  key={thought.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      {thought.uid !== user.uid && (
                        <div className="flex items-center gap-1 bg-neutral-900 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest">
                          <UserIcon size={8} />
                          <span>{members[thought.uid]?.displayName?.split(' ')?.[0] || 'Socio'}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 bg-neutral-900 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest">
                        <span>{VISIBILITY_LABELS[thought.visibility || DEFAULT_PRIVATE_VISIBILITY]}</span>
                      </div>
                      {thought.categories?.map((catId: string) => {
                        const search = (catId || '').trim().toLowerCase();
                        const cat = MIND_CATEGORIES.find(c => 
                          search === c.id.toLowerCase() || 
                          search === c.label.toLowerCase() ||
                          search.includes(c.label.toLowerCase())
                        );
                        return (
                          <div key={catId} className="flex items-center gap-1 bg-neutral-50 px-2 py-1 rounded-lg border border-neutral-100">
                            <span>{cat?.icon || 'Etiqueta'}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                              {cat?.label || catId}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-neutral-300 font-bold">
                      {format(thought.timestamp.toDate(), 'MMM d, yyyy - h:mm a')}
                    </p>
                  </div>
                  <p className="text-neutral-700 text-sm leading-relaxed whitespace-pre-wrap mb-4">
                    {thought.content}
                  </p>
                  
                  {thought.imageUrl && (
                    <div className="mt-4 space-y-4">
                      <img 
                        src={thought.imageUrl} 
                        alt="Imagen de la entrada" 
                        className="w-full h-48 object-cover rounded-2xl border border-neutral-100"
                        referrerPolicy="no-referrer"
                      />
                      {thought.analysis && (
                        <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-1">
                            <Sparkles size={10} /> Lectura visual
                          </p>
                          <p className="text-xs text-neutral-600 italic leading-relaxed">
                            {thought.analysis}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredThoughts.length === 0 && (
              <div className="text-center py-20 bg-neutral-100 rounded-[2rem] border-2 border-dashed border-neutral-200">
                <p className="text-neutral-400 font-bold">No hay entradas en esta categoria.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
