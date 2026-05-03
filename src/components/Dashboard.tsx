import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, handleFirestoreError, OperationType, addDoc, doc, updateDoc } from '../firebase.ts';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  CreditCard, 
  Banknote, 
  Briefcase,
  LayoutGrid,
  Trash2,
  Settings2,
  GripVertical,
  Eye,
  EyeOff,
  X,
  Target,
  PieChart as PieChartIcon,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Brain
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, startOfYear, endOfYear, subDays } from 'date-fns';
import LuzCommandCenter from './LuzCommandCenter.tsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';

const COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];

export default function Dashboard({ user }: { user: any }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [finances, setFinances] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState('Este mes');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  
  const defaultWidgets = [
    { id: 'balances', title: 'Cuentas', visible: true },
    { id: 'cashflow', title: 'Flujo de efectivo', visible: true },
    { id: 'alignment', title: 'Alineacion personal', visible: true },
    { id: 'trend', title: 'Tendencia de saldo', visible: true },
    { id: 'expenseStructure', title: 'Estructura de los gastos', visible: true },
    { id: 'recentRecords', title: 'Ultimos registros', visible: true },
    { id: 'calendarSummary', title: 'Tiempo y prioridades', visible: true },
    { id: 'goalsSummary', title: 'Objetivos', visible: true },
  ];

  const [widgetsConfig, setWidgetsConfig] = useState<any[]>(user.dashboardWidgets || defaultWidgets);
  const [goals, setGoals] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [thoughts, setThoughts] = useState<any[]>([]);

  const saveDashboardConfig = async (newConfig: any[]) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { dashboardWidgets: newConfig });
      setWidgetsConfig(newConfig);
    } catch (error) {
      console.error("Error saving dashboard config:", error);
    }
  };

  const toggleWidgetVisibility = (id: string) => {
    const newConfig = widgetsConfig.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
    saveDashboardConfig(newConfig);
  };

  const reorderWidgets = (newOrder: any[]) => {
    saveDashboardConfig(newOrder);
  };
  const [newAccount, setNewAccount] = useState({
    name: '',
    currency: 'ARS',
    balance: 0,
    color: '#36A2EB',
    type: 'bank'
  });

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'accounts'), {
        ...newAccount,
        uid: user.uid,
        householdId: user.householdId,
        balance: parseFloat(newAccount.balance.toString())
      });
      setIsAddingAccount(false);
      setNewAccount({ name: '', currency: 'ARS', balance: 0, color: '#36A2EB', type: 'bank' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'accounts');
    }
  };

  useEffect(() => {
    // Fetch Accounts
    const qAccounts = query(
      collection(db, 'accounts'),
      where('householdId', '==', user.householdId)
    );
    const unsubAccounts = onSnapshot(qAccounts, (snap) => {
      setAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'accounts');
    });

    // Fetch Finances
    const qFinances = query(
      collection(db, 'finances'),
      where('householdId', '==', user.householdId),
      orderBy('date', 'desc')
    );
    const unsubFinances = onSnapshot(qFinances, (snap) => {
      setFinances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'finances');
    });

    // Fetch Goals
    const qGoals = query(
      collection(db, 'goals'),
      where('householdId', '==', user.householdId),
      where('year', '==', new Date().getFullYear())
    );
    const unsubGoals = onSnapshot(qGoals, (snap) => {
      setGoals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'goals');
    });

    const qHabits = query(
      collection(db, 'habits'),
      where('householdId', '==', user.householdId)
    );
    const unsubHabits = onSnapshot(qHabits, (snap) => {
      setHabits(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'habits');
    });

    const qThoughts = query(
      collection(db, 'thoughts'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubThoughts = onSnapshot(qThoughts, (snap) => {
      setThoughts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'thoughts');
    });

    return () => {
      unsubAccounts();
      unsubFinances();
      unsubGoals();
      unsubHabits();
      unsubThoughts();
    };
  }, [user.uid, user.householdId]);

  // Calculate stats for the selected period
  const stats = useMemo(() => {
    const now = new Date();
    let start = startOfMonth(now);
    let end = endOfMonth(now);

    if (timeRange === 'Mes pasado') {
      const lastMonth = subMonths(now, 1);
      start = startOfMonth(lastMonth);
      end = endOfMonth(lastMonth);
    } else if (timeRange === 'Este año') {
      start = startOfYear(now);
      end = endOfYear(now);
    }
    
    const periodFinances = finances.filter(f => {
      const d = f.date.toDate();
      return d >= start && d <= end;
    });

    const income = periodFinances.filter(f => f.type === 'income').reduce((acc, f) => acc + f.amount, 0);
    const expenses = periodFinances.filter(f => f.type === 'expense').reduce((acc, f) => acc + f.amount, 0);
    
    // Group by currency
    const balancesByCurrency = accounts.reduce((acc: any, accnt: any) => {
      acc[accnt.currency] = (acc[accnt.currency] || 0) + (accnt.balance || 0);
      return acc;
    }, {});

    // Group expenses by category for pie chart
    const expensesByCategory = periodFinances
      .filter(f => f.type === 'expense')
      .reduce((acc: any, f) => {
        acc[f.category] = (acc[f.category] || 0) + f.amount;
        return acc;
      }, {});

    const pieData = Object.entries(expensesByCategory).map(([name, value]) => ({ name, value: value as number }));

    // Daily trend
    const days = eachDayOfInterval({ start, end });
    
    // To calculate a realistic cumulative balance trend, we'd need the balance at the start of the period.
    // Since we only have current balances, we'll work backwards or just show the net flow trend.
    // Let's show the net flow trend but cumulative for the period.
    let cumulativeFlow = 0;
    
    const trendData = days.map(day => {
      const dayFinances = periodFinances.filter(f => isSameDay(f.date.toDate(), day));
      const dayIncome = dayFinances.filter(f => f.type === 'income').reduce((acc, f) => acc + f.amount, 0);
      const dayExpenses = dayFinances.filter(f => f.type === 'expense').reduce((acc, f) => acc + f.amount, 0);
      cumulativeFlow += (dayIncome - dayExpenses);
      
      return {
        date: format(day, 'd MMM'),
        Ingresos: dayIncome,
        Gastos: dayExpenses,
        Flujo: cumulativeFlow
      };
    });

    return {
      income,
      expenses,
      net: income - expenses,
      balancesByCurrency,
      pieData,
      trendData
    };
  }, [finances, accounts, timeRange]);

  const alignment = useMemo(() => {
    const myGoals = goals.filter(goal => goal.uid === user.uid);
    const myHabits = habits.filter(habit => habit.uid === user.uid);
    const activeHabits = myHabits.filter(habit => habit.status === 'active');
    const goalsWithActiveHabits = myGoals.filter(goal =>
      activeHabits.some(habit => habit.linkedGoalIds?.includes(goal.id))
    );
    const goalsWithoutHabits = myGoals.filter(goal =>
      !myHabits.some(habit => habit.linkedGoalIds?.includes(goal.id))
    );
    const habitsWithoutGoals = activeHabits.filter(habit =>
      !Array.isArray(habit.linkedGoalIds) || habit.linkedGoalIds.length === 0
    );
    const sevenDaysAgo = subDays(new Date(), 7);
    const recentThoughts = thoughts.filter(thought => {
      const timestamp = thought.timestamp;
      const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
      return !Number.isNaN(date.getTime()) && date >= sevenDaysAgo;
    });

    const scoreParts = [
      myGoals.length > 0,
      goalsWithoutHabits.length === 0 && myGoals.length > 0,
      habitsWithoutGoals.length === 0 && activeHabits.length > 0,
      recentThoughts.length > 0,
      stats.net >= 0 || finances.length === 0,
    ];
    const score = Math.round((scoreParts.filter(Boolean).length / scoreParts.length) * 100);

    const signals = [];
    if (myGoals.length === 0) {
      signals.push({
        tone: 'warning',
        title: 'Falta una direccion explicita',
        body: 'Todavia no hay objetivos autenticos para cruzar decisiones, habitos, finanzas y diario.',
      });
    }
    if (goalsWithoutHabits.length > 0) {
      signals.push({
        tone: 'warning',
        title: `${goalsWithoutHabits.length} objetivo(s) sin habitos`,
        body: 'Hay metas declaradas que todavia no tienen decisiones o acciones repetibles asociadas.',
      });
    }
    if (habitsWithoutGoals.length > 0) {
      signals.push({
        tone: 'neutral',
        title: `${habitsWithoutGoals.length} habito(s) sin objetivo`,
        body: 'Conviene decidir si estos habitos sostienen una busqueda real o si son ruido.',
      });
    }
    if (recentThoughts.length === 0) {
      signals.push({
        tone: 'neutral',
        title: 'Sin diario reciente',
        body: 'No hay entradas de los ultimos 7 dias para ver patrones, bloqueos o aprendizajes recientes.',
      });
    }
    if (stats.net < 0 && finances.length > 0) {
      signals.push({
        tone: 'warning',
        title: 'Flujo mensual negativo',
        body: 'Los gastos del periodo superan los ingresos. Revisar si ese desbalance responde a una prioridad real.',
      });
    }
    if (signals.length === 0) {
      signals.push({
        tone: 'positive',
        title: 'Base alineada',
        body: 'Hay objetivos, habitos vinculados, diario reciente y flujo financiero bajo control.',
      });
    }

    const weeklyFocus =
      goalsWithoutHabits[0]?.title
        ? `Definir un habito concreto para "${goalsWithoutHabits[0].title}".`
        : habitsWithoutGoals[0]?.title
          ? `Conectar "${habitsWithoutGoals[0].title}" con un objetivo o soltarlo.`
          : recentThoughts.length === 0
            ? 'Registrar al menos una entrada honesta en el diario esta semana.'
            : stats.net < 0 && finances.length > 0
              ? 'Revisar los gastos del mes y separar prioridad real de impulso.'
              : 'Mantener el sistema y revisar si algun objetivo necesita mas soporte.';

    return {
      score,
      activeSupportedGoals: goalsWithActiveHabits.length,
      goalsWithoutHabits,
      habitsWithoutGoals,
      recentThoughts: recentThoughts.length,
      signals: signals.slice(0, 3),
      weeklyFocus,
    };
  }, [goals, habits, thoughts, stats.net, finances.length, user.uid]);

  return (
    <div className="min-h-screen space-y-6 pb-24 md:pb-8">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.85fr)]">
        <div className="rounded-[2rem] bg-neutral-950 p-6 text-white shadow-sm md:p-8 xl:p-10">
          <div className="flex h-full min-h-[260px] flex-col justify-between gap-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="mb-4 inline-flex rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
                  Entendete mejor. Decidi mejor. Vivi mas alineado.
                </p>
                <h2 className="text-4xl font-black tracking-tight md:text-6xl">
                  Claridad para ordenar tu vida real.
                </h2>
                <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-white/62">
                  VEO registra tu vida, detecta patrones y conecta objetivos, tiempo, habitos, finanzas y energia sin empujarte a producir por producir.
                </p>
              </div>
              <div className="rounded-[1.5rem] bg-white px-5 py-4 text-neutral-950">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Alineacion</p>
                <p className="mt-1 text-5xl font-black tracking-tight">{alignment.score}%</p>
              </div>
            </div>

            <LuzCommandCenter user={user} />

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile label="Objetivos activos" value={goals.filter(goal => goal.status !== 'completed').length} />
              <MetricTile label="Habitos activos" value={habits.filter(habit => habit.status === 'active').length} />
              <MetricTile label="Entradas 7 dias" value={alignment.recentThoughts} />
            </div>
          </div>
        </div>

        <aside className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Saldo total</p>
            <div className="mt-5 space-y-3">
              {(Object.entries(stats.balancesByCurrency || {})).map(([curr, val]: [string, any]) => (
                <div key={curr} className="flex items-end justify-between gap-4">
                  <span className="text-3xl font-black tracking-tight text-neutral-900 tabular-nums">
                    {val.toLocaleString()}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">{curr}</span>
                </div>
              ))}
              {Object.keys(stats.balancesByCurrency).length === 0 && (
                <span className="text-3xl font-black text-neutral-300">0.00</span>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Flujo del periodo</p>
            <div className="mt-5 flex items-end justify-between gap-4">
              <span className={`text-4xl font-black tracking-tight tabular-nums ${stats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}
              </span>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${stats.net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {stats.net >= 0 ? 'Ordenado' : 'Revisar'}
              </span>
            </div>
            <p className="mt-4 text-sm font-medium leading-6 text-neutral-500">
              {stats.net >= 0 ? 'El periodo no esta tensionando la caja.' : 'Los gastos superan los ingresos del periodo.'}
            </p>
          </div>
        </aside>
      </section>

      {/* Date Selector & Actions */}
      <div className="flex flex-col gap-4 rounded-[1.75rem] border border-neutral-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 bg-white p-1.5 rounded-2xl border border-neutral-200/60 shadow-sm">
          <button className="p-2.5 hover:bg-neutral-50 rounded-xl transition-all active:scale-95 text-neutral-400 hover:text-neutral-900"><ChevronLeft size={18} /></button>
          <div className="px-4 py-1.5 flex flex-col items-center">
            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Periodo</span>
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-transparent text-sm font-black text-neutral-900 outline-none cursor-pointer appearance-none text-center"
            >
              <option>Este mes</option>
              <option>Mes pasado</option>
              <option>Este año</option>
            </select>
          </div>
          <button className="p-2.5 hover:bg-neutral-50 rounded-xl transition-all active:scale-95 text-neutral-400 hover:text-neutral-900"><ChevronRight size={18} /></button>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsCustomizing(true)}
            className="flex items-center gap-2.5 text-xs font-black text-neutral-600 hover:text-neutral-900 transition-all bg-white px-6 py-3.5 rounded-2xl border border-neutral-200/60 shadow-sm active:scale-95"
          >
            <Settings2 size={16} className="text-neutral-400" />
            Personalizar inicio
          </button>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-6">
        {(widgetsConfig || []).map((widget) => {
          if (!widget.visible) return null;
          
          switch (widget.id) {
            case 'balances':
              return (
                <div key="balances" className="flex flex-col rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-2">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <Wallet size={16} className="text-neutral-400" />
                      Cuentas
                    </h3>
                    <button 
                      onClick={() => setIsAddingAccount(true)}
                      className="p-1.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                    {(accounts || []).map((acc) => (
                      <div key={acc.id} className="flex items-center justify-between p-3 rounded-2xl border border-neutral-50 hover:bg-neutral-50 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
                            style={{ backgroundColor: acc.color || '#36A2EB' }}
                          >
                            {acc.type === 'bank' ? <Banknote size={18} /> : 
                             acc.type === 'credit_card' ? <CreditCard size={18} /> : 
                             acc.type === 'investment' ? <Briefcase size={18} /> : 
                             <Wallet size={18} />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-neutral-800">{acc.name}</p>
                            <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">{acc.type}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-neutral-900 tabular-nums">
                            {acc.balance?.toLocaleString()} {acc.currency}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            case 'cashflow':
              return (
                <div key="cashflow" className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-4">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <TrendingUp size={16} className="text-neutral-400" />
                      Flujo de efectivo
                    </h3>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }} 
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                        <Bar dataKey="Ingresos" fill="#10B981" radius={[4, 4, 0, 0]} barSize={12} />
                        <Bar dataKey="Gastos" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-6 mt-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Ingresos
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Gastos
                    </div>
                  </div>
                </div>
              );
            case 'alignment':
              return (
                <div key="alignment" className="relative overflow-hidden rounded-[1.75rem] border border-neutral-800 bg-neutral-900 p-6 text-white shadow-sm lg:col-span-4">
                  <div className="absolute right-0 top-0 p-6 opacity-10">
                    <Sparkles size={120} />
                  </div>
                  <div className="relative z-10 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-white">
                          <Sparkles size={16} className="text-neutral-400" />
                          Alineacion personal
                        </h3>
                        <p className="text-sm text-neutral-400 mt-2 max-w-xl">
                          Primer cruce entre lo que decis que queres, lo que haces, como usas tu tiempo y como usas tu plata.
                        </p>
                      </div>
                      <div className="bg-white text-neutral-900 rounded-3xl px-5 py-4 min-w-28 text-center">
                        <p className="text-3xl font-black">{alignment.score}%</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Base</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-white/10 p-4 border border-white/10">
                        <p className="text-2xl font-black">{alignment.activeSupportedGoals}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Objetivos con habito</p>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-4 border border-white/10">
                        <p className="text-2xl font-black">{alignment.habitsWithoutGoals.length}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Habitos sueltos</p>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-4 border border-white/10">
                        <p className="text-2xl font-black">{alignment.recentThoughts}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Diario 7 dias</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {alignment.signals.map((signal, index) => (
                        <div key={`${signal.title}-${index}`} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 border border-white/10">
                          <div className={`mt-0.5 rounded-full p-1 ${
                            signal.tone === 'positive' ? 'bg-emerald-500 text-white' :
                            signal.tone === 'warning' ? 'bg-amber-400 text-neutral-900' :
                            'bg-neutral-700 text-white'
                          }`}>
                            {signal.tone === 'positive' ? <CheckCircle2 size={14} /> : signal.tone === 'warning' ? <AlertCircle size={14} /> : <Brain size={14} />}
                          </div>
                          <div>
                            <p className="text-sm font-black">{signal.title}</p>
                            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{signal.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-3xl bg-white text-neutral-900 p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Foco recomendado de la semana</p>
                      <p className="mt-2 text-base font-black leading-tight">{alignment.weeklyFocus}</p>
                    </div>
                  </div>
                </div>
              );
            case 'trend':
              return (
                <div key="trend" className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-4">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <TrendingUp size={16} className="text-neutral-400" />
                      Tendencia de saldo
                    </h3>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stats.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }} 
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                        <Area type="monotone" dataKey="Flujo" stroke="#3B82F6" fillOpacity={1} fill="url(#colorBalance)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            case 'expenseStructure':
              return (
                <div key="expenseStructure" className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-2">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <PieChartIcon size={16} className="text-neutral-400" />
                      Estructura de gastos
                    </h3>
                  </div>
                  <div className="h-64 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={stats.pieData && stats.pieData.length > 0 ? stats.pieData : [{ name: 'Sin datos', value: 1 }]}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {(stats.pieData || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                          {(!stats.pieData || stats.pieData.length === 0) && <Cell fill="#f0f0f0" />}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Gastos</p>
                      <p className="text-base font-black text-neutral-900">-{stats.expenses.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            case 'recentRecords':
              return (
                <div key="recentRecords" className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-2">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <Briefcase size={16} className="text-neutral-400" />
                      Ultimos registros
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {(finances || []).slice(0, 6).map((record) => (
                      <div key={record.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm ${record.type === 'income' ? 'bg-emerald-500' : record.type === 'expense' ? 'bg-rose-500' : 'bg-amber-500'}`}>
                            {record.type === 'income' ? <TrendingUp size={16} /> : 
                             record.type === 'expense' ? <TrendingDown size={16} /> : 
                             <Plus size={16} />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-neutral-800 truncate max-w-[100px]">{record.description || record.category}</p>
                            <p className="text-[10px] font-medium text-neutral-400">{format(record.date.toDate(), 'd MMM')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-black ${record.type === 'income' ? 'text-emerald-600' : record.type === 'expense' ? 'text-rose-600' : 'text-amber-600'}`}>
                            {record.type === 'income' ? '+' : record.type === 'expense' ? '-' : ''}
                            {record.amount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {finances.length === 0 && (
                      <p className="text-center text-xs text-neutral-400 py-8">No hay registros recientes</p>
                    )}
                  </div>
                </div>
              );
            case 'calendarSummary':
              return (
                <div key="calendarSummary" className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-2">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <Calendar size={16} className="text-neutral-400" />
                      Tiempo y prioridades
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Uso del tiempo</p>
                      <p className="text-sm text-neutral-600 leading-relaxed">
                        Conecta tu calendario para ver si tu semana refleja tus prioridades reales.
                      </p>
                    </div>
                    <button 
                      onClick={() => (window as any).setActiveTab?.('calendar')}
                      className="w-full py-3 bg-neutral-900 text-white text-xs font-black rounded-2xl hover:bg-neutral-800 transition-all active:scale-95"
                    >
                      Ir a Calendario
                    </button>
                  </div>
                </div>
              );
            case 'goalsSummary':
              const completed = goals.filter(g => g.status === 'completed').length;
              const total = goals.length;
              const progress = total > 0 ? (completed / total) * 100 : 0;
              return (
                <div key="goalsSummary" className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-2">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <Target size={16} className="text-neutral-400" />
                      Objetivos
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-black text-neutral-900">{completed}/{total}</p>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Logrados</p>
                      </div>
                      <div className="w-12 h-12 rounded-full border-4 border-neutral-100 flex items-center justify-center relative">
                        <svg className="w-full h-full -rotate-90">
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="4"
                            className="text-emerald-500"
                            strokeDasharray={`${progress * 1.25} 125`}
                          />
                        </svg>
                        <span className="absolute text-[9px] font-black">{Math.round(progress)}%</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {(goals || []).slice(0, 3).map(goal => (
                        <div key={goal.id} className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
                          <div className={`w-1.5 h-1.5 rounded-full ${goal.status === 'completed' ? 'bg-emerald-500' : goal.status === 'in_progress' ? 'bg-amber-500' : 'bg-neutral-200'}`} />
                          <span className={goal.status === 'completed' ? 'line-through opacity-50' : ''}>{goal.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.07] p-4">
      <p className="text-3xl font-black tracking-tight text-white">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{label}</p>
    </div>
  );
}
