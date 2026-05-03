import React, { useState, useEffect } from 'react';
import { db, collection, addDoc, query, where, onSnapshot, handleFirestoreError, OperationType, updateDoc, doc, serverTimestamp, deleteDoc } from '../firebase.ts';
import { CheckCircle2, Plus, Calendar, Info, Loader2, Sparkles, User as UserIcon, Droplets, Trophy, History, ArrowRight, Flame, AlertCircle, Star, Award, Zap, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays, isToday, isYesterday, eachDayOfInterval, subDays, startOfToday, startOfWeek, addDays, getWeek, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Habits({ user }: { user: any }) {
  const [habits, setHabits] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [members, setMembers] = useState<{ [key: string]: any }>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHabit, setNewHabit] = useState({ title: '', description: '', startDate: format(new Date(), 'yyyy-MM-dd'), linkedGoalIds: [] as string[] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [view, setView] = useState<'current' | 'inventory'>('current');
  const [celebration, setCelebration] = useState<{ show: boolean, message: string }>({ show: false, message: '' });

  useEffect(() => {
    const qMembers = query(collection(db, 'users'), where('householdId', '==', user.householdId));
    const unsubMembers = onSnapshot(qMembers, (snap) => {
      const memberMap: { [key: string]: any } = {};
      snap.docs.forEach(doc => {
        memberMap[doc.id] = doc.data();
      });
      setMembers(memberMap);
    });

    const q = query(collection(db, 'habits'), where('householdId', '==', user.householdId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'habits');
    });

    const qLogs = query(collection(db, 'habitLogs'), where('uid', '==', user.uid));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qGoals = query(
      collection(db, 'goals'),
      where('householdId', '==', user.householdId),
      where('year', '==', new Date().getFullYear())
    );
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goals');
    });

    return () => {
      unsubscribe();
      unsubMembers();
      unsubLogs();
      unsubGoals();
    };
  }, [user.uid, user.householdId]);

  const myHabits = habits.filter(h => h.uid === user.uid);
  const activeHabit = myHabits.find(h => !h.incorporated && h.status === 'active');
  const inventory = myHabits.filter(h => h.incorporated);
  const availableGoals = goals.filter(goal => goal.uid === user.uid || goal.householdId === user.householdId);

  const getLinkedGoalTitles = (habit: any) => {
    const linkedGoalIds = Array.isArray(habit.linkedGoalIds) ? habit.linkedGoalIds : [];
    return linkedGoalIds
      .map((goalId: string) => goals.find(goal => goal.id === goalId)?.title)
      .filter(Boolean);
  };

  const toggleLinkedGoal = (goalId: string) => {
    setNewHabit(prev => ({
      ...prev,
      linkedGoalIds: prev.linkedGoalIds.includes(goalId)
        ? prev.linkedGoalIds.filter(id => id !== goalId)
        : [...prev.linkedGoalIds, goalId],
    }));
  };

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeHabit) {
      alert("Ya tienes un hábito en curso. Incorpóralo antes de empezar otro.");
      return;
    }
    if (!newHabit.title || !newHabit.description) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'habits'), {
        uid: user.uid,
        householdId: user.householdId || null,
        title: newHabit.title,
        description: newHabit.description,
        startDate: newHabit.startDate,
        progress: 0,
        streak: 0,
        lastWatered: null,
        incorporated: false,
        status: 'active',
        linkedGoalIds: newHabit.linkedGoalIds,
        createdAt: serverTimestamp()
      });
      setShowAddModal(false);
      setNewHabit({ title: '', description: '', startDate: format(new Date(), 'yyyy-MM-dd'), linkedGoalIds: [] });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'habits');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogStatus = async (habitId: string, date: string, status: 'green' | 'yellow' | 'red' | 'none') => {
    const existingLog = logs.find(l => l.habitId === habitId && l.date === date);

    try {
      if (status === 'none') {
        if (existingLog) {
          await deleteDoc(doc(db, 'habitLogs', existingLog.id));
        }
      } else if (existingLog) {
        await updateDoc(doc(db, 'habitLogs', existingLog.id), {
          status,
          timestamp: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'habitLogs'), {
          habitId,
          uid: user.uid,
          date,
          status,
          timestamp: serverTimestamp()
        });
      }

      // Update habit progress and check for streaks
      const habit = habits.find(h => h.id === habitId);
      if (habit) {
        const habitLogs = logs.filter(l => l.habitId === habitId);
        // Calculate latest green count
        let greenCount = habitLogs.filter(l => l.status === 'green' && l.date !== date).length;
        if (status === 'green') greenCount += 1;

        // Calculate current streak
        let currentStreak = 0;
        const sortedLogs = [...habitLogs].sort((a, b) => b.date.localeCompare(a.date));
        // If we just added/updated today, consider it
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        let checkDate = new Date();
        
        while (true) {
          const dStr = format(checkDate, 'yyyy-MM-dd');
          const logForDay = (dStr === date) ? { status } : habitLogs.find(l => l.date === dStr);
          if (logForDay?.status === 'green') {
            currentStreak++;
            checkDate = subDays(checkDate, 1);
          } else {
            break;
          }
        }

        // Celebration milestones
        if (status === 'green' && !existingLog) {
          const milestones = [7, 15, 30, 60, 90];
          if (milestones.includes(currentStreak)) {
            setCelebration({ show: true, message: `¡Increíble! Racha de ${currentStreak} días alcanzada.` });
            setTimeout(() => setCelebration({ show: false, message: '' }), 5000);
          }
        }
        
        await updateDoc(doc(db, 'habits', habitId), {
          progress: greenCount,
          streak: currentStreak,
          lastWatered: status !== 'none' ? serverTimestamp() : null
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'habitLogs');
    }
  };

  const handleFinishChallenge = async (habit: any) => {
    const habitLogs = logs.filter(l => l.habitId === habit.id);
    const greenCount = habitLogs.filter(l => l.status === 'green').length;
    const score = (greenCount / 90) * 100;
    
    // Check last 3 weeks (21 days)
    const habitStartDate = parseISO(habit.startDate);
    const challengeEndDate = addDays(habitStartDate, 89);
    const last21DaysStart = subDays(challengeEndDate, 20);
    
    const last21DaysLogs = habitLogs.filter(l => {
      const d = parseISO(l.date);
      return d >= last21DaysStart && d <= challengeEndDate;
    });
    
    const redCount = last21DaysLogs.filter(l => l.status === 'red').length;
    const isWon = score >= 80 && redCount <= 1;

    try {
      await updateDoc(doc(db, 'habits', habit.id), {
        status: isWon ? 'completed' : 'abandoned',
        incorporated: isWon,
        finalScore: score,
        finishedAt: serverTimestamp()
      });
      
      if (isWon) {
        setCelebration({ show: true, message: `¡HÁBITO INCORPORADO! Puntaje final: ${Math.round(score)}%` });
      } else {
        alert(`Desafío terminado. Puntaje: ${Math.round(score)}%. No se cumplieron las condiciones para incorporar el hábito.`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'habits');
    }
  };

  const HabitGrid = ({ habitId, startDateStr }: { habitId: string, startDateStr: string }) => {
    const habitStartDate = parseISO(startDateStr);
    const gridStart = startOfWeek(habitStartDate, { weekStartsOn: 1 }); // Monday
    const gridEnd = addDays(gridStart, 91); // 13 weeks * 7 days = 91 days
    
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    
    // Group days into weeks
    const weeks: any[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    return (
      <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        <div className="flex gap-3 min-w-max">
          {/* Day Labels */}
          <div className="flex flex-col gap-2 pt-10 pr-2">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
              <div key={i} className="h-8 md:h-10 flex items-center justify-end">
                <span className="text-[9px] font-black text-neutral-300 uppercase">{day}</span>
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, weekIdx) => {
            const isCurrentWeek = week.some(day => isToday(day));
            const weekLogs = week.map(d => logs.find(l => l.habitId === habitId && l.date === format(d, 'yyyy-MM-dd')));
            const isPerfectWeek = weekLogs.every(l => l?.status === 'green');
            const isSilverWeek = !isPerfectWeek && weekLogs.every(l => l && (l.status === 'green' || l.status === 'yellow'));
            
            return (
              <div 
                key={weekIdx} 
                className={`flex flex-col gap-2 p-1.5 rounded-xl transition-all relative ${
                  isCurrentWeek ? 'bg-neutral-100 ring-1 ring-neutral-200' : ''
                } ${isPerfectWeek ? 'bg-amber-50 ring-2 ring-amber-200 shadow-lg shadow-amber-100' : ''} ${isSilverWeek ? 'bg-slate-50 ring-2 ring-slate-200 shadow-lg shadow-slate-100' : ''}`}
              >
                {/* Week Number Label */}
                <div className="h-8 flex flex-col items-center justify-center gap-0.5">
                  {isPerfectWeek && <Star size={10} className="text-amber-500 fill-amber-500 animate-pulse" />}
                  {isSilverWeek && <Award size={10} className="text-slate-400 fill-slate-400" />}
                  {isCurrentWeek && !isPerfectWeek && !isSilverWeek && (
                    <motion.div 
                      layoutId="currentWeekIndicator"
                      className="text-[7px] font-black text-emerald-600 uppercase tracking-tighter leading-none"
                    >
                      Hoy
                    </motion.div>
                  )}
                  <span className={`text-[9px] font-black uppercase tracking-tighter leading-none ${
                    isPerfectWeek ? 'text-amber-700' : isSilverWeek ? 'text-slate-600' : isCurrentWeek ? 'text-neutral-900' : 'text-neutral-400'
                  }`}>
                    W{getWeek(week[0], { weekStartsOn: 1 })}
                  </span>
                </div>
                
                {/* Days in Week */}
                {week.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const log = logs.find(l => l.habitId === habitId && l.date === dateStr);
                  const isDayToday = isToday(day);
                  const isBeforeStart = day < habitStartDate;
                  const isAfter90Days = differenceInDays(day, habitStartDate) >= 90;
                  const isOutsideChallenge = isBeforeStart || isAfter90Days;
                  
                  return (
                    <button
                      key={dateStr}
                      onClick={() => {
                        if (isBeforeStart) return;
                        const newStatus = !log ? 'green' : 
                                         log.status === 'green' ? 'yellow' : 
                                         log.status === 'yellow' ? 'red' : 'none';
                        handleLogStatus(habitId, dateStr, newStatus as any);
                      }}
                      disabled={isBeforeStart}
                      className={`w-8 h-8 md:w-10 md:h-10 rounded-lg transition-all relative group ${
                        isOutsideChallenge ? 'opacity-20 cursor-not-allowed bg-neutral-100' :
                        !log ? 'bg-neutral-100 hover:bg-neutral-200' :
                        log.status === 'green' ? 'bg-emerald-500 shadow-lg shadow-emerald-200/50' :
                        log.status === 'yellow' ? 'bg-amber-400 shadow-lg shadow-amber-200/50' :
                        'bg-red-500 shadow-lg shadow-red-200/50'
                      } ${isDayToday ? 'ring-2 ring-neutral-400 ring-offset-1 scale-105 z-10' : ''} ${isPerfectWeek && log?.status === 'green' ? 'ring-1 ring-amber-300' : ''}`}
                      title={`${format(day, 'PP', { locale: es })}: ${log?.status || 'Sin registro'}`}
                    >
                      {isDayToday && (
                        <div className="absolute inset-0 rounded-lg border border-white/30 animate-pulse pointer-events-none" />
                      )}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-20">
                        {format(day, 'd MMM', { locale: es })}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4 md:p-8">
      <AnimatePresence>
        {celebration.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] bg-neutral-900 text-white px-8 py-4 rounded-full font-black flex items-center gap-3 shadow-2xl border border-white/10"
          >
            <Zap className="text-amber-400 fill-amber-400" size={20} />
            <span>{celebration.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-black text-neutral-900 tracking-tighter">Hábitos</h2>
          <p className="text-neutral-500 font-medium">Forja tu disciplina, un día a la vez.</p>
        </div>
        
        <div className="flex bg-neutral-100 p-1 rounded-2xl">
          <button
            onClick={() => setView('current')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              view === 'current' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            En Curso
          </button>
          <button
            onClick={() => setView('inventory')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              view === 'inventory' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            Inventario
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === 'current' ? (
          <motion.div
            key="current"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {activeHabit ? (
              <div className="bg-white rounded-[3rem] border border-neutral-100 shadow-2xl shadow-neutral-200/50 overflow-hidden">
                <div className="p-8 md:p-12 space-y-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-[0.2em]">
                        <Flame size={14} />
                        <span>Hábito en Desarrollo</span>
                      </div>
                      <h3 className="text-4xl font-black text-neutral-900 tracking-tight">{activeHabit.title}</h3>
                      <p className="text-neutral-500 font-medium max-w-md">{activeHabit.description}</p>
                      {getLinkedGoalTitles(activeHabit).length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {getLinkedGoalTitles(activeHabit).map((title: string) => (
                            <span key={title} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                              <Target size={10} />
                              {title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 bg-neutral-50 p-4 rounded-[2rem] border border-neutral-100">
                      <div className="text-center px-4 border-r border-neutral-200">
                        <div className="text-3xl font-black text-neutral-900">{activeHabit.streak}</div>
                        <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Racha</div>
                      </div>
                      <div className="text-center px-4">
                        <div className="text-3xl font-black text-emerald-600">
                          {Math.max(0, 90 - differenceInDays(new Date(), parseISO(activeHabit.startDate)))}
                        </div>
                        <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Días Restantes</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <span className="text-xs font-black text-neutral-400 uppercase tracking-widest">Registro del Desafío</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 bg-neutral-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 transition-all duration-1000" 
                              style={{ width: `${Math.min(100, (activeHabit.progress / 90) * 100)}%` }} 
                            />
                          </div>
                          <span className="text-xs font-black text-neutral-900">{Math.round((activeHabit.progress / 90) * 100)}%</span>
                        </div>
                      </div>
                      
                      {differenceInDays(new Date(), parseISO(activeHabit.startDate)) >= 89 && (
                        <button
                          onClick={() => handleFinishChallenge(activeHabit)}
                          className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                        >
                          Finalizar y Evaluar
                        </button>
                      )}

                      <div className="flex gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-bold text-neutral-400 uppercase">Bien</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-amber-400" />
                          <span className="text-[10px] font-bold text-neutral-400 uppercase">Normal</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span className="text-[10px] font-bold text-neutral-400 uppercase">Mal</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6 bg-neutral-50 rounded-[2rem] border border-neutral-100">
                      <HabitGrid habitId={activeHabit.id} startDateStr={activeHabit.startDate || format(activeHabit.createdAt?.toDate() || new Date(), 'yyyy-MM-dd')} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <button
                      onClick={() => handleLogStatus(activeHabit.id, format(new Date(), 'yyyy-MM-dd'), 'green')}
                      className="flex flex-col items-center gap-2 p-6 rounded-3xl bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 transition-all group"
                    >
                      <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
                        <CheckCircle2 size={24} />
                      </div>
                      <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">Lo hice bien</span>
                    </button>

                    <button
                      onClick={() => handleLogStatus(activeHabit.id, format(new Date(), 'yyyy-MM-dd'), 'yellow')}
                      className="flex flex-col items-center gap-2 p-6 rounded-3xl bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-all group"
                    >
                      <div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-200 group-hover:scale-110 transition-transform">
                        <History size={24} />
                      </div>
                      <span className="text-xs font-black text-amber-700 uppercase tracking-widest">Más o menos</span>
                    </button>

                    <button
                      onClick={() => handleLogStatus(activeHabit.id, format(new Date(), 'yyyy-MM-dd'), 'red')}
                      className="flex flex-col items-center gap-2 p-6 rounded-3xl bg-red-50 border border-red-100 hover:bg-red-100 transition-all group"
                    >
                      <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-200 group-hover:scale-110 transition-transform">
                        <AlertCircle size={24} />
                      </div>
                      <span className="text-xs font-black text-red-700 uppercase tracking-widest">No cumplí</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-neutral-50 rounded-[3rem] border-2 border-dashed border-neutral-200 p-12 text-center space-y-6">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-neutral-100">
                  <Plus size={40} className="text-neutral-300" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-neutral-900">No hay hábito en curso</h3>
                  <p className="text-neutral-500 font-medium max-w-xs mx-auto">Comienza un nuevo desafío de 90 días para transformar tu vida.</p>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="bg-neutral-900 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-200"
                >
                  Empezar Nuevo Hábito
                </button>
              </div>
            )}

            {/* Other members habits */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest ml-4">Hábitos de la Familia</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {habits.filter(h => h.uid !== user.uid && !h.incorporated).map(habit => (
                  <div key={habit.id} className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {members[habit.uid]?.photoURL ? (
                        <img src={members[habit.uid].photoURL} className="w-12 h-12 rounded-2xl object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center text-neutral-400">
                          <UserIcon size={20} />
                        </div>
                      )}
                      <div>
                        <h5 className="font-black text-neutral-900">{habit.title}</h5>
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{members[habit.uid]?.displayName || 'Socio'}</p>
                        {getLinkedGoalTitles(habit).length > 0 && (
                          <p className="text-[10px] font-bold text-neutral-400 mt-1">
                            Objetivo: {getLinkedGoalTitles(habit)[0]}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full">
                      <Flame size={14} className="text-emerald-600" />
                      <span className="text-xs font-black text-emerald-600">{habit.streak}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="inventory"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
          >
            {inventory.length > 0 ? (
              inventory.map(habit => (
                <div key={habit.id} className="bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <Trophy size={24} className="text-amber-400 opacity-20 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-neutral-900 leading-tight">{habit.title}</h4>
                      <p className="text-sm text-neutral-500 font-medium mt-1">{habit.description}</p>
                      {getLinkedGoalTitles(habit).length > 0 && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-3">
                          Sostiene: {getLinkedGoalTitles(habit).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="pt-4 border-t border-neutral-50 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Flame size={14} className="text-orange-500" />
                        <span className="text-xs font-black text-neutral-900">{habit.streak} días</span>
                      </div>
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Incorporado</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto">
                  <Trophy size={32} className="text-neutral-200" />
                </div>
                <p className="text-neutral-400 font-bold uppercase tracking-widest">Aún no has incorporado hábitos</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-emerald-600 font-black text-[10px] uppercase tracking-[0.2em] mb-4">
                <Sparkles size={14} />
                <span>Nuevo Desafío</span>
              </div>
              <h3 className="text-4xl font-black text-neutral-900 tracking-tight mb-2">Forjar Hábito</h3>
              <p className="text-neutral-500 font-medium mb-8">Elige un hábito que quieras cultivar durante los próximos 90 días.</p>
              
              <form onSubmit={handleAddHabit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">¿Qué quieres lograr?</label>
                  <input 
                    type="text"
                    value={newHabit.title}
                    onChange={e => setNewHabit(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ej: Meditación Diaria"
                    className="w-full bg-neutral-50 border border-neutral-100 rounded-2xl p-5 text-lg font-bold focus:ring-2 focus:ring-neutral-900 transition-all"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">¿Cuándo empiezas?</label>
                  <input 
                    type="date"
                    value={newHabit.startDate}
                    onChange={e => setNewHabit(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full bg-neutral-50 border border-neutral-100 rounded-2xl p-5 text-lg font-bold focus:ring-2 focus:ring-neutral-900 transition-all"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">¿Por qué es importante?</label>
                  <textarea 
                    value={newHabit.description}
                    onChange={e => setNewHabit(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe el impacto que tendrá en tu vida..."
                    className="w-full h-32 bg-neutral-50 border border-neutral-100 rounded-2xl p-5 text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all resize-none"
                    required
                  />
                </div>

                {availableGoals.length > 0 && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Objetivos que sostiene</label>
                    <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
                      {availableGoals.map(goal => (
                        <button
                          key={goal.id}
                          type="button"
                          onClick={() => toggleLinkedGoal(goal.id)}
                          className={`text-left rounded-2xl border p-4 transition-all ${
                            newHabit.linkedGoalIds.includes(goal.id)
                              ? 'border-neutral-900 bg-neutral-900 text-white shadow-lg shadow-neutral-200'
                              : 'border-neutral-100 bg-neutral-50 text-neutral-600 hover:border-neutral-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Target size={16} className="mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-black leading-tight">{goal.title}</p>
                              <p className={`mt-1 text-[10px] font-bold uppercase tracking-widest ${
                                newHabit.linkedGoalIds.includes(goal.id) ? 'text-white/60' : 'text-neutral-400'
                              }`}>
                                {goal.status === 'completed' ? 'Logrado' : goal.status === 'in_progress' ? 'En proceso' : 'Pendiente'}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-6 py-5 rounded-2xl font-black text-neutral-400 hover:bg-neutral-50 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-[2] bg-neutral-900 text-white px-6 py-5 rounded-2xl font-black hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-200 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Droplets size={18} />}
                    Empezar Desafío
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
