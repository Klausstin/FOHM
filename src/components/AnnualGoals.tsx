import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Plus, Trash2, CheckCircle2, Circle, Calendar, Filter, LayoutGrid, List as ListIcon, AlertCircle, MessageSquare, Send, User as UserIcon, X, Pencil, Check } from 'lucide-react';
import { MIND_CATEGORIES } from '../lib/mindCategories.ts';
import { format } from 'date-fns';
import {
  createGoal,
  createGoalComment,
  deleteGoal,
  deleteGoalComment,
  subscribeToGoalComments,
  subscribeToHouseholdGoals,
  updateGoalComment,
  updateGoalStatus,
} from '../features/goals/goal.service.ts';
import type { GoalCommentRecord, GoalRecord } from '../features/goals/goal.types.ts';

const GOAL_CATEGORIES = [
  { id: 'avatar-personaje', label: 'Yo (Avatar)', icon: '👤', color: 'bg-neutral-50 text-neutral-600' },
  { id: 'vicky-amor', label: 'Vicky (Amor)', icon: '❤️', color: 'bg-rose-50 text-rose-600' },
  { id: 'aventura-movimiento', label: 'Aventura', icon: '🏃', color: 'bg-orange-50 text-orange-600' },
  { id: 'laburo-desafío', label: 'Laburo', icon: '💼', color: 'bg-blue-50 text-blue-600' },
  { id: 'finanzas-estabilidad', label: 'Finanzas', icon: '💰', color: 'bg-emerald-50 text-emerald-600' },
  { id: 'educación-crecimiento', label: 'Educación', icon: '📚', color: 'bg-indigo-50 text-indigo-600' },
  { id: 'relaciones-sociales', label: 'Social', icon: '🤝', color: 'bg-cyan-50 text-cyan-600' },
  { id: 'salud-entrenamiento', label: 'Salud', icon: '💪', color: 'bg-red-50 text-red-600' },
  { id: 'ocio-entretenimiento', label: 'Ocio', icon: '🎮', color: 'bg-purple-50 text-purple-600' },
];

interface HabitSupport {
  id: string;
  uid: string;
  householdId?: string;
  title: string;
  status: string;
  incorporated?: boolean;
  linkedGoalIds?: string[];
}

export default function AnnualGoals({ user }: { user: any }) {
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [habits, setHabits] = useState<HabitSupport[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<GoalRecord | null>(null);
  const [comments, setComments] = useState<GoalCommentRecord[]>([]);
  const [newComment, setNewComment] = useState('');
  const [members, setMembers] = useState<{ [key: string]: any }>({});
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    categories: [MIND_CATEGORIES[0].id],
    year: new Date().getFullYear()
  });
  const [filter, setFilter] = useState<string>('all');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');


  useEffect(() => {
    // Fetch household members for names/photos
    const qMembers = query(collection(db, 'users'), where('householdId', '==', user.householdId));
    const unsubMembers = onSnapshot(qMembers, (snap) => {
      const memberMap: { [key: string]: any } = {};
      snap.docs.forEach(doc => {
        memberMap[doc.id] = doc.data();
      });
      setMembers(memberMap);
    });

    const currentYear = new Date().getFullYear();
    const unsubscribe = subscribeToHouseholdGoals(user.householdId, currentYear, setGoals, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goals');
    });

    const qHabits = query(collection(db, 'habits'), where('householdId', '==', user.householdId));
    const unsubHabits = onSnapshot(qHabits, (snapshot) => {
      setHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HabitSupport)));
    });

    return () => {
      unsubscribe();
      unsubMembers();
      unsubHabits();
    };
  }, [user.uid, user.householdId]);

  useEffect(() => {
    if (!selectedGoal) {
      setComments([]);
      return;
    }

    const unsubscribe = subscribeToGoalComments(selectedGoal.id, setComments, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goalComments');
    });

    return () => unsubscribe();
  }, [selectedGoal]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedGoal) return;

    try {
      await createGoalComment({
        goalId: selectedGoal.id,
        uid: user.uid,
        userName: user.displayName || 'Usuario',
        userPhoto: user.photoURL || '',
        content: newComment,
      });
      setNewComment('');
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editCommentContent.trim()) return;
    try {
      await updateGoalComment(commentId, editCommentContent);
      setEditingCommentId(null);
      setEditCommentContent('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goalComments/${commentId}`);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('¿Borrar este comentario?')) return;
    try {
      await deleteGoalComment(commentId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `goalComments/${commentId}`);
    }
  };


  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.title) return;

    try {
      await createGoal({
        uid: user.uid,
        householdId: user.householdId || null,
        year: newGoal.year,
        title: newGoal.title,
        description: newGoal.description,
        categories: newGoal.categories,
      });
      setNewGoal({ title: '', description: '', categories: [MIND_CATEGORIES[0].id], year: new Date().getFullYear() });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'goals');
    }
  };

  const toggleStatus = async (goal: GoalRecord) => {
    const nextStatus: GoalRecord['status'] = 
      goal.status === 'pending' ? 'in_progress' : 
      goal.status === 'in_progress' ? 'completed' : 'pending';
    
    try {
      await updateGoalStatus(goal.id, nextStatus);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goal.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este objetivo?')) return;
    try {
      await deleteGoal(id);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `goals/${id}`);
    }
  };

  const filteredGoals = filter === 'all' ? goals : goals.filter(g => g.categories?.includes(filter));
  const habitsWithoutGoal = habits.filter(habit => habit.uid === user.uid && (!Array.isArray(habit.linkedGoalIds) || habit.linkedGoalIds.length === 0));
  const goalsWithoutHabits = goals.filter(goal => !habits.some(habit => habit.linkedGoalIds?.includes(goal.id)));
  const activeSupportedGoals = goals.filter(goal => habits.some(habit => habit.linkedGoalIds?.includes(goal.id) && habit.status === 'active'));

  const stats = {
    total: goals.length,
    completed: goals.filter(g => g.status === 'completed').length,
    inProgress: goals.filter(g => g.status === 'in_progress').length,
    supported: activeSupportedGoals.length,
  };

  const getGoalHabits = (goalId: string) => habits.filter(habit => habit.linkedGoalIds?.includes(goalId));

  const toggleCategory = (catId: string) => {
    setNewGoal(prev => ({
      ...prev,
      categories: prev.categories.includes(catId)
        ? prev.categories.filter(id => id !== catId)
        : [...prev.categories, catId]
    }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4 md:p-8">
      <header className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-neutral-400 font-mono text-xs tracking-widest uppercase">
            <Target size={14} />
            <span>Planificación Anual</span>
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-neutral-200">
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-900 font-black">{stats.total}</span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600 font-black">{stats.completed}</span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Logrados</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-500 font-black">{stats.inProgress}</span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase">En Proceso</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-blue-600 font-black">{stats.supported}</span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Con habito</span>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center bg-neutral-900 text-white w-12 h-12 rounded-2xl hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-200"
          >
            <Target size={24} />
          </button>
        </div>

        <div className="space-y-2">
          <h1 className="text-6xl font-black text-neutral-900 tracking-tighter">
            Objetivos
          </h1>
          <p className="text-neutral-500 font-medium max-w-md">
            Define tus metas. Salud, finanzas y orden para una vida mejor.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-[2rem] border border-neutral-100 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Alineacion activa</p>
          <p className="text-3xl font-black text-neutral-900 mt-2">{activeSupportedGoals.length}</p>
          <p className="text-sm text-neutral-500 font-medium mt-1">Objetivos con al menos un habito activo.</p>
        </div>
        <div className="bg-white rounded-[2rem] border border-neutral-100 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Sin soporte</p>
          <p className="text-3xl font-black text-amber-600 mt-2">{goalsWithoutHabits.length}</p>
          <p className="text-sm text-neutral-500 font-medium mt-1">Objetivos que todavia no tienen habitos asociados.</p>
        </div>
        <div className="bg-white rounded-[2rem] border border-neutral-100 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Habitos sueltos</p>
          <p className="text-3xl font-black text-neutral-900 mt-2">{habitsWithoutGoal.length}</p>
          <p className="text-sm text-neutral-500 font-medium mt-1">Habitos propios que no empujan un objetivo declarado.</p>
        </div>
      </section>

      <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-100 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all text-center ${
              filter === 'all' 
                ? 'bg-neutral-900 text-white shadow-lg' 
                : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
            }`}
          >
            Todos
          </button>
          {(MIND_CATEGORIES || []).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                filter === cat.id 
                  ? 'bg-neutral-900 text-white shadow-lg' 
                  : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
              }`}
            >
              <span>{cat.icon}</span>
              <span className="hidden sm:inline">{cat.label?.split(' ')?.[0]}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm"
          >
            <motion.div 
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-neutral-100"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-black text-neutral-900 mb-6 tracking-tight">Nuevo Objetivo</h2>
              <form onSubmit={handleAddGoal} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Título</label>
                  <input
                    type="text"
                    required
                    value={newGoal.title}
                    onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                    className="w-full bg-neutral-50 border-none rounded-2xl px-4 py-3 text-neutral-900 font-medium focus:ring-2 focus:ring-neutral-900 transition-all"
                    placeholder="Ej: Correr mi primera maratón"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Descripción</label>
                  <textarea
                    value={newGoal.description}
                    onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                    className="w-full bg-neutral-50 border-none rounded-2xl px-4 py-3 text-neutral-900 font-medium focus:ring-2 focus:ring-neutral-900 transition-all h-24 resize-none"
                    placeholder="Detalles adicionales..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Categorías</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(MIND_CATEGORIES || []).map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={`p-3 rounded-2xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${
                          newGoal.categories.includes(cat.id)
                            ? 'bg-neutral-900 text-white shadow-md'
                            : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
                        }`}
                      >
                        <span>{cat.icon}</span>
                        <span className="truncate">{cat.label?.split(' ')?.[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-6 py-3 rounded-2xl font-bold text-neutral-500 hover:bg-neutral-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-neutral-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200"
                  >
                    Crear Meta
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {(filteredGoals || []).map((goal) => (
            <motion.div
              key={goal.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => setSelectedGoal(goal)}
              className={`group bg-white rounded-[2rem] p-6 border border-neutral-200 shadow-sm hover:shadow-xl hover:shadow-neutral-100 transition-all relative overflow-hidden cursor-pointer ${
                goal.status === 'completed' ? 'bg-emerald-50/30 border-emerald-100' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-wrap gap-2">
                  {(goal.categories || []).map(catId => {
                    const cat = MIND_CATEGORIES.find(c => c.id === catId);
                    return (
                      <div key={catId} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${cat?.color || 'bg-neutral-50 text-neutral-600'}`}>
                        <span>{cat?.icon || '🏷️'}</span>
                        <span>{cat?.label?.split(' ')?.[0] || catId}</span>
                      </div>
                    );
                  })}
                  {goal.uid !== user.uid && (
                    <div className="flex items-center gap-1 bg-neutral-900 text-white px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                      <UserIcon size={8} />
                      <span>{members[goal.uid]?.displayName?.split(' ')?.[0] || 'Socio'}</span>
                    </div>
                  )}
                </div>
                {goal.uid === user.uid && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(goal.id); }}
                    className="p-2 text-neutral-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <h3 className={`text-xl font-bold text-neutral-900 mb-2 leading-tight ${goal.status === 'completed' ? 'line-through opacity-50' : ''}`}>
                {goal.title}
              </h3>
              
              {goal.description && (
                <p className="text-sm text-neutral-500 mb-6 line-clamp-2 font-medium">
                  {goal.description}
                </p>
              )}

              <div className="mb-4 space-y-2">
                {getGoalHabits(goal.id).length > 0 ? (
                  getGoalHabits(goal.id).slice(0, 2).map(habit => (
                    <div key={habit.id} className="flex items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                      <CheckCircle2 size={12} className={habit.status === 'active' ? 'text-emerald-600' : 'text-neutral-400'} />
                      <span className="truncate">{habit.title}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700">
                    <AlertCircle size={12} />
                    <span>Sin habitos asociados</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-neutral-50">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleStatus(goal); }}
                  disabled={goal.uid !== user.uid}
                  className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all ${
                    goal.status === 'completed' ? 'text-emerald-600' :
                    goal.status === 'in_progress' ? 'text-amber-500' : 'text-neutral-400'
                  } ${goal.uid !== user.uid ? 'cursor-default' : ''}`}
                >
                  {goal.status === 'completed' ? <CheckCircle2 size={18} /> :
                   goal.status === 'in_progress' ? <AlertCircle size={18} /> : <Circle size={18} />}
                  {goal.status === 'completed' ? 'Logrado' :
                   goal.status === 'in_progress' ? 'En Proceso' : 'Pendiente'}
                </button>
                
                <div className="text-[10px] font-bold text-neutral-300">
                  {goal.createdAt ? format(goal.createdAt.toDate(), 'MMM d') : ''}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Goal Details Modal */}
        <AnimatePresence>
          {selectedGoal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-md"
              onClick={() => setSelectedGoal(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-8 pb-4 flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {(selectedGoal.categories || []).map(catId => {
                        const cat = MIND_CATEGORIES.find(c => c.id === catId);
                        return (
                          <div key={catId} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${cat?.color || 'bg-neutral-50 text-neutral-600'}`}>
                            <span>{cat?.icon || '🏷️'}</span>
                            <span>{cat?.label?.split(' ')?.[0] || catId}</span>
                          </div>
                        );
                      })}
                      {selectedGoal.uid !== user.uid && (
                        <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1 rounded-full">
                          {members[selectedGoal.uid]?.photoURL ? (
                            <img 
                              src={members[selectedGoal.uid]?.photoURL} 
                              alt="" 
                              className="w-4 h-4 rounded-full"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-4 h-4 bg-neutral-200 rounded-full flex items-center justify-center text-[8px] font-bold">
                              {members[selectedGoal.uid]?.displayName?.[0]}
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-neutral-600">
                            {members[selectedGoal.uid]?.displayName}
                          </span>
                        </div>
                      )}
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">{selectedGoal.title}</h2>
                  </div>
                  <button 
                    onClick={() => setSelectedGoal(null)}
                    className="p-2 bg-neutral-50 text-neutral-400 rounded-full hover:bg-neutral-100 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="px-8 flex-1 overflow-y-auto space-y-8 py-4 custom-scrollbar">
                  {selectedGoal.description && (
                    <div className="bg-neutral-50 p-6 rounded-3xl border border-neutral-100">
                      <p className="text-neutral-700 leading-relaxed font-medium">
                        {selectedGoal.description}
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      Habitos vinculados ({getGoalHabits(selectedGoal.id).length})
                    </h3>
                    {getGoalHabits(selectedGoal.id).length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {getGoalHabits(selectedGoal.id).map(habit => (
                          <div key={habit.id} className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4">
                            <p className="font-black text-neutral-900 leading-tight">{habit.title}</p>
                            <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                              {habit.status === 'active' ? 'Activo' : habit.incorporated ? 'Incorporado' : habit.status}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
                        <p className="text-sm font-bold text-amber-800">
                          Este objetivo todavia no tiene habitos vinculados. Conviene definir al menos una accion repetible que lo empuje.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                      <MessageSquare size={14} />
                      Comentarios ({comments.length})
                    </h3>
                    
                    <div className="space-y-4">
                      {(comments || []).map((comment) => (
                        <div key={comment.id} className="group/comment flex gap-4">
                          {comment.userPhoto ? (
                            <img 
                              src={comment.userPhoto} 
                              alt="" 
                              className="w-8 h-8 rounded-full shadow-sm"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center text-xs font-bold">
                              {comment.userName?.[0]}
                            </div>
                          )}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-neutral-900">{comment.userName}</span>
                                <span className="text-[10px] font-medium text-neutral-300">
                                  {comment.createdAt ? format(comment.createdAt.toDate(), 'MMM d, HH:mm') : ''}
                                </span>
                              </div>
                              
                              {(comment.uid === user.uid || user.role === 'admin') && (
                                <div className="flex items-center gap-1 opacity-0 group-hover/comment:opacity-100 transition-opacity">
                                  {editingCommentId === comment.id ? (
                                    <>
                                      <button 
                                        onClick={() => handleUpdateComment(comment.id)}
                                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                      >
                                        <Check size={14} />
                                      </button>
                                      <button 
                                        onClick={() => {
                                          setEditingCommentId(null);
                                          setEditCommentContent('');
                                        }}
                                        className="p-1 text-neutral-400 hover:bg-neutral-100 rounded-lg transition-all"
                                      >
                                        <X size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button 
                                        onClick={() => {
                                          setEditingCommentId(comment.id);
                                          setEditCommentContent(comment.content);
                                        }}
                                        className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-all"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteComment(comment.id)}
                                        className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {editingCommentId === comment.id ? (
                              <div className="mt-1">
                                <textarea
                                  value={editCommentContent}
                                  onChange={(e) => setEditCommentContent(e.target.value)}
                                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-neutral-900 resize-none"
                                  rows={2}
                                  autoFocus
                                />
                              </div>
                            ) : (
                              <div className="bg-neutral-50 p-4 rounded-2xl rounded-tl-none border border-neutral-100">
                                <p className="text-sm text-neutral-700 font-medium">{comment.content}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {comments.length === 0 && (
                        <p className="text-center py-8 text-neutral-400 text-sm font-medium italic">
                          No hay comentarios aún. ¡Sé el primero en comentar!
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-8 pt-4 bg-white border-t border-neutral-50">
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Escribe un comentario..."
                      className="flex-1 bg-neutral-50 border-none rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim()}
                      className="bg-neutral-900 text-white p-3 rounded-2xl hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200 disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {filteredGoals.length === 0 && (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-neutral-50 text-neutral-200 rounded-full flex items-center justify-center mx-auto">
              <Target size={32} />
            </div>
            <p className="text-neutral-400 font-bold">No hay objetivos en esta categoría aún.</p>
          </div>
        )}
      </div>
    </div>
  );
}
