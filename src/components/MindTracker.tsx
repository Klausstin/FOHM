import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType } from '../firebase.ts';
import { Brain, Mic, Send, Trash2, Filter, Sparkles, MessageSquare, History, Image, Loader2, X, CheckCircle2, User as UserIcon, Edit3, Search } from 'lucide-react';
import { MIND_CATEGORIES } from '../lib/mindCategories.ts';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { analyzeMentalConsistency, transcribeAudio, analyzeImage, categorizeThought, checkHabitProgress } from '../services/gemini.ts';
import { DEFAULT_PRIVATE_VISIBILITY, VISIBILITY_LABELS } from '../domain/permissions.ts';
import { buildFinalJournalContent, EMPTY_REFLECTION, REFLECTION_PRODUCTIVITY_OPTIONS } from '../features/journal/journal.helpers.ts';
import { createJournalEntry, deleteJournalEntry, subscribeToUserJournalEntries, updateJournalEntry } from '../features/journal/journal.service.ts';
import type { JournalEntryRecord, JournalReflection, SelectedJournalImage } from '../features/journal/journal.types.ts';


export default function MindTracker({ user }: { user: any }) {
  const [thoughts, setThoughts] = useState<JournalEntryRecord[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [activeHabits, setActiveHabits] = useState<any[]>([]);
  const [members, setMembers] = useState<{ [key: string]: any }>({});
  const [newThought, setNewThought] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [isMutatingEntry, setIsMutatingEntry] = useState(false);
  const [habitFeedback, setHabitFeedback] = useState<string | null>(null);
  
  // Guided Reflection State
  const [showReflection, setShowReflection] = useState(false);
  const [reflection, setReflection] = useState<JournalReflection>(EMPTY_REFLECTION);

  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d' | 'year'>('all');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
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
        try {
          imageAnalysis = await analyzeImage(selectedImage.data, selectedImage.type, newThought || "Analiza esta imagen.");
        } catch (error) {
          console.warn("No se pudo analizar la imagen. La entrada se guardara igual.", error);
        }
      }

      const finalContent = buildFinalJournalContent(newThought, reflection, showReflection);

      if (!finalContent.trim() && !selectedImage) return;

      // Automatic categorization keeps manual tags as the source of truth when present.
      let categories = selectedCategories;
      if (categories.length === 0 && finalContent.trim()) {
        try {
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
        } catch (error) {
          console.warn("No se pudo categorizar automaticamente. La entrada se guardara con categoria general.", error);
        }
      }
      if (categories.length === 0) categories = [MIND_CATEGORIES[0].id];

      if (finalContent.trim()) {
        try {
          const feedback = await checkHabitProgress(finalContent, activeHabits);
          if (feedback) {
            setHabitFeedback(feedback);
            setTimeout(() => setHabitFeedback(null), 10000);
          }
        } catch (error) {
          console.warn("No se pudo cruzar la entrada con habitos. La entrada se guardara igual.", error);
        }
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
      const errorInfo = handleFirestoreError(error, OperationType.CREATE, 'thoughts');
      alert(`No pude guardar la entrada. Detalle: ${errorInfo.error}`);
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

  const startEditingEntry = (entry: JournalEntryRecord) => {
    setEditingEntryId(entry.id);
    setEditContent(entry.content || '');
    setEditCategories(entry.categories || []);
  };

  const cancelEditingEntry = () => {
    setEditingEntryId(null);
    setEditContent('');
    setEditCategories([]);
  };

  const saveEditingEntry = async () => {
    if (!editingEntryId || !editContent.trim() || editCategories.length === 0) return;

    setIsMutatingEntry(true);
    try {
      await updateJournalEntry({
        id: editingEntryId,
        content: editContent.trim(),
        categories: editCategories,
      });
      cancelEditingEntry();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'thoughts');
    } finally {
      setIsMutatingEntry(false);
    }
  };

  const handleDeleteEntry = async (entry: JournalEntryRecord) => {
    const confirmed = window.confirm('Eliminar esta entrada del diario? Esta accion no se puede deshacer.');
    if (!confirmed) return;

    setIsMutatingEntry(true);
    try {
      await deleteJournalEntry(entry.id);
      if (editingEntryId === entry.id) {
        cancelEditingEntry();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'thoughts');
    } finally {
      setIsMutatingEntry(false);
    }
  };

  const toggleEditCategory = (categoryId: string) => {
    setEditCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  const formatEntryDate = (entry: JournalEntryRecord) => {
    const rawTimestamp = entry.timestamp;
    const date = typeof rawTimestamp?.toDate === 'function'
      ? rawTimestamp.toDate()
      : new Date(rawTimestamp);

    if (Number.isNaN(date.getTime())) return '';
    return format(date, 'MMM d, yyyy - h:mm a');
  };

  const filteredThoughts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const targetCat = filterCategory ? MIND_CATEGORIES.find(cat => cat.id === filterCategory) : null;
    const now = new Date();

    const targetId = targetCat?.id.toLowerCase();
    const targetLabel = targetCat?.label.toLowerCase();

    return thoughts.filter(t => {
      const categories = Array.isArray(t.categories) ? t.categories : [];
      const matchesCategory = !targetCat || categories.some((c: string) => {
          if (!c || typeof c !== 'string') return false;
          const search = c.trim().toLowerCase();
          return search === targetId || search === targetLabel || search.includes(targetLabel || '');
        });

      const categoryLabels = categories
        .map((catId: string) => MIND_CATEGORIES.find(c => c.id === catId)?.label || catId)
        .join(' ')
        .toLowerCase();
      const matchesSearch = !normalizedSearch ||
        (t.content || '').toLowerCase().includes(normalizedSearch) ||
        categoryLabels.includes(normalizedSearch) ||
        softMatch(t.content || '', normalizedSearch);

      const entryDate = getEntryDate(t);
      const matchesDate =
        dateFilter === 'all' ||
        (dateFilter === '7d' && entryDate && daysBetween(entryDate, now) <= 7) ||
        (dateFilter === '30d' && entryDate && daysBetween(entryDate, now) <= 30) ||
        (dateFilter === 'year' && entryDate && entryDate.getFullYear() === now.getFullYear());

      return matchesCategory && matchesSearch && matchesDate;
    });
  }, [thoughts, filterCategory, searchTerm, dateFilter]);

  const selectedEntry = useMemo(
    () => filteredThoughts.find(entry => entry.id === selectedEntryId) || filteredThoughts[0] || null,
    [filteredThoughts, selectedEntryId],
  );

  const entriesByMonth = useMemo(() => {
    return filteredThoughts.reduce((acc: Record<string, JournalEntryRecord[]>, entry) => {
      const date = getEntryDate(entry);
      const key = date ? format(date, 'MMMM yyyy') : 'Sin fecha';
      acc[key] = acc[key] || [];
      acc[key].push(entry);
      return acc;
    }, {});
  }, [filteredThoughts]);

  const categoryCounts = useMemo(() => {
    return MIND_CATEGORIES.map(category => ({
      ...category,
      count: thoughts.filter(entry => (entry.categories || []).includes(category.id)).length,
    }));
  }, [thoughts]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterCategory(null);
    setDateFilter('all');
  };

  return (
    <div className="grid min-h-[calc(100vh-5rem)] gap-5 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
      <aside className="space-y-5">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Diario</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-neutral-950">Biblioteca</h2>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <LibraryStat label="Entradas" value={thoughts.length} />
            <LibraryStat label="Filtradas" value={filteredThoughts.length} />
            <LibraryStat label="7 dias" value={thoughts.filter(entry => {
              const date = getEntryDate(entry);
              return date && daysBetween(date, new Date()) <= 7;
            }).length} />
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-3">
            <Search size={17} className="text-neutral-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar tema, persona, palabra..."
              className="w-full bg-transparent text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { id: 'all', label: 'Todo' },
              { id: '7d', label: '7 dias' },
              { id: '30d', label: '30 dias' },
              { id: 'year', label: 'Este anio' },
            ].map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setDateFilter(option.id as typeof dateFilter)}
                className={`rounded-2xl px-3 py-2 text-xs font-black transition ${
                  dateFilter === option.id ? 'bg-neutral-950 text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterCategory(null)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                !filterCategory ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              Todas
            </button>
            {categoryCounts.map(category => (
              <button
                key={category.id}
                type="button"
                onClick={() => setFilterCategory(category.id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                  filterCategory === category.id ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
              >
                {category.label} {category.count > 0 ? category.count : ''}
              </button>
            ))}
          </div>

          {(searchTerm || filterCategory || dateFilter !== 'all') && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 w-full rounded-2xl border border-neutral-200 py-2 text-xs font-black uppercase tracking-widest text-neutral-500 transition hover:bg-neutral-50"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowQuickEntry(prev => !prev)}
          className="flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-neutral-950 px-4 py-4 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
        >
          <MessageSquare size={16} />
          {showQuickEntry ? 'Cerrar entrada' : 'Entrada manual'}
        </button>
      </aside>

      <section className="min-h-0 rounded-[1.75rem] border border-neutral-200 bg-white p-4 shadow-sm">
        {showQuickEntry && (
          <QuickJournalEntry
            newThought={newThought}
            setNewThought={setNewThought}
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
            handleSubmit={handleSubmit}
            isSaving={isAnalyzingImage || isCategorizing}
          />
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Archivo</p>
            <h3 className="mt-1 text-xl font-black text-neutral-950">{filteredThoughts.length} entradas</h3>
          </div>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-200 px-4 text-xs font-black uppercase tracking-widest text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            {isAnalyzing ? <Sparkles className="animate-spin" size={15} /> : <Sparkles size={15} />}
            Analizar
          </button>
        </div>

        {analysisResult && (
          <div className="mb-4 rounded-[1.5rem] bg-neutral-950 p-5 text-white">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Analisis</p>
              <button type="button" onClick={() => setAnalysisResult(null)} className="text-white/40 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-white/72">{analysisResult}</p>
          </div>
        )}

        <div className="max-h-[calc(100vh-12rem)] space-y-5 overflow-y-auto pr-2">
          {Object.entries(entriesByMonth).map(([month, entries]) => (
            <div key={month}>
              <p className="sticky top-0 z-10 mb-2 bg-white/95 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400 backdrop-blur">
                {month}
              </p>
              <div className="space-y-3">
                {entries.map(entry => (
                  <JournalListItem
                    key={entry.id}
                    entry={entry}
                    active={selectedEntry?.id === entry.id}
                    onClick={() => setSelectedEntryId(entry.id)}
                    formatDate={formatEntryDate}
                  />
                ))}
              </div>
            </div>
          ))}

          {filteredThoughts.length === 0 && (
            <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-10 text-center">
              <p className="text-sm font-black text-neutral-400">No hay entradas para estos filtros.</p>
            </div>
          )}
        </div>
      </section>

      <aside className="min-h-0 rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
        {selectedEntry ? (
          <EntryReader
            entry={selectedEntry}
            members={members}
            user={user}
            editingEntryId={editingEntryId}
            editContent={editContent}
            setEditContent={setEditContent}
            editCategories={editCategories}
            toggleEditCategory={toggleEditCategory}
            startEditingEntry={startEditingEntry}
            cancelEditingEntry={cancelEditingEntry}
            saveEditingEntry={saveEditingEntry}
            handleDeleteEntry={handleDeleteEntry}
            isMutatingEntry={isMutatingEntry}
            formatDate={formatEntryDate}
          />
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-[1.5rem] bg-neutral-50 p-6 text-center">
            <p className="text-sm font-black text-neutral-400">Elegir una entrada</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function LibraryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <p className="text-2xl font-black text-neutral-950">{value}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
    </div>
  );
}

function QuickJournalEntry({
  newThought,
  setNewThought,
  selectedCategories,
  setSelectedCategories,
  handleSubmit,
  isSaving,
}: {
  newThought: string;
  setNewThought: (value: string) => void;
  selectedCategories: string[];
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>;
  handleSubmit: (event?: React.FormEvent) => Promise<void>;
  isSaving: boolean;
}) {
  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-[1.5rem] bg-neutral-50 p-4">
      <textarea
        value={newThought}
        onChange={(event) => setNewThought(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Entrada rapida..."
        className="min-h-28 w-full resize-none rounded-2xl border border-neutral-200 bg-white p-4 text-sm font-semibold leading-6 text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900/10"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {MIND_CATEGORIES.map(category => (
          <button
            key={category.id}
            type="button"
            onClick={() => {
              setSelectedCategories(prev =>
                prev.includes(category.id)
                  ? prev.filter(id => id !== category.id)
                  : [...prev, category.id],
              );
            }}
            className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
              selectedCategories.includes(category.id) ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-500'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={isSaving || !newThought.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-neutral-950 px-5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-40"
        >
          {isSaving ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
          Guardar
        </button>
      </div>
    </form>
  );
}

function JournalListItem({
  entry,
  active,
  onClick,
  formatDate,
}: {
  entry: JournalEntryRecord;
  active: boolean;
  onClick: () => void;
  formatDate: (entry: JournalEntryRecord) => string;
}) {
  const preview = (entry.content || '').replace(/\s+/g, ' ').trim();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
        active ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-100 bg-white hover:border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${active ? 'text-white/38' : 'text-neutral-400'}`}>
          {formatDate(entry)}
        </p>
        <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${active ? 'bg-white/10 text-white/50' : 'bg-neutral-100 text-neutral-400'}`}>
          {VISIBILITY_LABELS[entry.visibility || DEFAULT_PRIVATE_VISIBILITY]}
        </span>
      </div>
      <p className={`line-clamp-3 text-sm font-semibold leading-6 ${active ? 'text-white/76' : 'text-neutral-700'}`}>
        {preview || 'Entrada sin texto'}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(entry.categories || []).slice(0, 4).map(categoryId => {
          const category = findMindCategory(categoryId);
          return (
            <span key={categoryId} className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${active ? 'bg-white/10 text-white/45' : 'bg-neutral-100 text-neutral-400'}`}>
              {category?.label || categoryId}
            </span>
          );
        })}
      </div>
    </button>
  );
}

function EntryReader({
  entry,
  members,
  user,
  editingEntryId,
  editContent,
  setEditContent,
  editCategories,
  toggleEditCategory,
  startEditingEntry,
  cancelEditingEntry,
  saveEditingEntry,
  handleDeleteEntry,
  isMutatingEntry,
  formatDate,
}: {
  entry: JournalEntryRecord;
  members: { [key: string]: any };
  user: any;
  editingEntryId: string | null;
  editContent: string;
  setEditContent: (value: string) => void;
  editCategories: string[];
  toggleEditCategory: (categoryId: string) => void;
  startEditingEntry: (entry: JournalEntryRecord) => void;
  cancelEditingEntry: () => void;
  saveEditingEntry: () => Promise<void>;
  handleDeleteEntry: (entry: JournalEntryRecord) => Promise<void>;
  isMutatingEntry: boolean;
  formatDate: (entry: JournalEntryRecord) => string;
}) {
  const isEditing = editingEntryId === entry.id;
  const isOwner = entry.uid === user.uid;

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">{formatDate(entry)}</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Entrada</h3>
          {entry.uid !== user.uid && (
            <p className="mt-1 text-xs font-bold text-neutral-400">{members[entry.uid]?.displayName || 'Compartida'}</p>
          )}
        </div>
        {isOwner && !isEditing && (
          <div className="flex gap-1">
            <button type="button" onClick={() => startEditingEntry(entry)} className="rounded-full p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-950">
              <Edit3 size={16} />
            </button>
            <button type="button" onClick={() => handleDeleteEntry(entry)} disabled={isMutatingEntry} className="rounded-full p-2 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-neutral-950 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white">
          {VISIBILITY_LABELS[entry.visibility || DEFAULT_PRIVATE_VISIBILITY]}
        </span>
        {(entry.categories || []).map(categoryId => {
          const category = findMindCategory(categoryId);
          return (
            <span key={categoryId} className="rounded-full bg-neutral-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
              {category?.label || categoryId}
            </span>
          );
        })}
      </div>

      {isEditing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <textarea
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                saveEditingEntry();
              }
            }}
            className="min-h-72 flex-1 resize-none rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 text-sm font-semibold leading-7 text-neutral-800 outline-none focus:ring-2 focus:ring-neutral-900/10"
          />
          <div className="flex flex-wrap gap-2">
            {MIND_CATEGORIES.map(category => (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleEditCategory(category.id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                  editCategories.includes(category.id) ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancelEditingEntry} className="rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-500 transition hover:bg-neutral-100">
              Cancelar
            </button>
            <button type="button" onClick={saveEditingEntry} disabled={isMutatingEntry || !editContent.trim() || editCategories.length === 0} className="rounded-2xl bg-neutral-950 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-40">
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-[1.5rem] bg-neutral-50 p-5">
          <p className="whitespace-pre-wrap text-base font-medium leading-8 text-neutral-800">{entry.content}</p>
          {entry.imageUrl && (
            <img src={entry.imageUrl} alt="Imagen de la entrada" className="mt-5 max-h-80 w-full rounded-2xl object-cover" referrerPolicy="no-referrer" />
          )}
          {entry.analysis && (
            <div className="mt-5 rounded-2xl bg-white p-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Lectura visual</p>
              <p className="text-sm font-semibold leading-6 text-neutral-600">{entry.analysis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getEntryDate(entry: JournalEntryRecord) {
  const rawTimestamp = entry.timestamp;
  const date = typeof rawTimestamp?.toDate === 'function'
    ? rawTimestamp.toDate()
    : new Date(rawTimestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(a: Date, b: Date) {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function softMatch(content: string, search: string) {
  const terms = normalizeText(search)
    .split(/[^a-z0-9]+/i)
    .filter(term => term.length > 2);
  if (terms.length === 0) return false;
  const normalizedContent = normalizeText(content);
  return terms.some(term => normalizedContent.includes(term));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findMindCategory(categoryId: string) {
  const search = (categoryId || '').trim().toLowerCase();
  return MIND_CATEGORIES.find(category =>
    search === category.id.toLowerCase() ||
    search === category.label.toLowerCase() ||
    search.includes(category.label.toLowerCase()),
  );
}
