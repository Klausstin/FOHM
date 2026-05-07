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
    } else if (timeRange === 'Este anio') {
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

  const activeGoals = goals.filter(goal => goal.status !== 'completed');
  const activeHabits = habits.filter(habit => habit.status === 'active');
  const pendingFinance = finances.filter(record => record.status === 'needs_review' || record.needsReview);
  const recentRecords = finances.slice(0, 5);
  const primarySignal = alignment.signals[0];

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-neutral-400">Inicio</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-neutral-950 md:text-4xl">Hoy</h2>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="h-12 flex-1 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-900 outline-none sm:w-40 sm:flex-none"
          >
            <option>Este mes</option>
            <option>Mes pasado</option>
            <option>Este anio</option>
          </select>
          <button
            onClick={() => setIsAddingAccount(true)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
          >
            <Plus size={16} />
            Cuenta
          </button>
        </div>
      </div>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <div className="rounded-[2rem] bg-neutral-950 p-4 text-white shadow-sm md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_340px]">
            <div className="flex flex-col gap-4">
              <LuzCommandCenter user={user} habits={habits} accounts={accounts} />
            </div>

            <aside className="grid gap-4">
              <FocusCard title="Foco de la semana" body={alignment.weeklyFocus} />
              <SignalCard signal={primarySignal} />
              <div className="grid grid-cols-3 gap-2">
                <MetricTile label="Objetivos" value={activeGoals.length} />
                <MetricTile label="Habitos" value={activeHabits.length} />
                <MetricTile label="Pendientes" value={pendingFinance.length} />
              </div>
            </aside>
          </div>
        </div>

        <aside className="grid gap-5 lg:grid-cols-3 2xl:grid-cols-1">
          <FinanceSnapshot stats={stats} pendingFinance={pendingFinance.length} />
          <LifeSnapshot alignment={alignment} />
          <RecentActivity records={recentRecords} />
        </aside>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Flujo del periodo</p>
              <h3 className="mt-1 text-xl font-black text-neutral-950">Movimiento</h3>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-black uppercase tracking-widest text-neutral-400">
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />Ingresos</span>
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" />Gastos</span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.trendData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eeeeee" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#999' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#999' }} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #eee', boxShadow: '0 12px 30px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="Ingresos" fill="#10B981" radius={[6, 6, 0, 0]} barSize={12} />
                <Bar dataKey="Gastos" fill="#EF4444" radius={[6, 6, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-5">
          <AccountsPanel accounts={accounts} onAdd={() => setIsAddingAccount(true)} />
          <NextStepsPanel alignment={alignment} stats={stats} pendingFinance={pendingFinance.length} />
        </div>
      </section>
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

function FocusCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-4 text-neutral-950">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">{title}</p>
      <p className="mt-2 text-base font-black leading-snug">{body}</p>
    </div>
  );
}

function SignalCard({ signal }: { signal: any }) {
  if (!signal) return null;

  const toneClass = signal.tone === 'positive'
    ? 'bg-emerald-500 text-white'
    : signal.tone === 'warning'
      ? 'bg-amber-400 text-neutral-950'
      : 'bg-white/12 text-white';

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-full p-1.5 ${toneClass}`}>
          {signal.tone === 'positive' ? <CheckCircle2 size={15} /> : signal.tone === 'warning' ? <AlertCircle size={15} /> : <Brain size={15} />}
        </div>
        <div>
          <p className="text-sm font-black text-white">{signal.title}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-white/52">{signal.body}</p>
        </div>
      </div>
    </div>
  );
}

function FinanceSnapshot({ stats, pendingFinance }: { stats: any; pendingFinance: number }) {
  const balances = Object.entries(stats.balancesByCurrency || {});

  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Finanzas</p>
          <h3 className="mt-1 text-xl font-black text-neutral-950">Caja</h3>
        </div>
        {pendingFinance > 0 && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
            {pendingFinance} por revisar
          </span>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {balances.length > 0 ? balances.map(([currency, value]: [string, any]) => (
          <div key={currency} className="flex items-end justify-between gap-4">
            <span className="text-3xl font-black tracking-tight text-neutral-950 tabular-nums">{Number(value || 0).toLocaleString()}</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">{currency}</span>
          </div>
        )) : (
          <p className="text-3xl font-black text-neutral-300">0</p>
        )}
      </div>

      <div className="mt-5 rounded-2xl bg-neutral-50 p-4">
        <p className={`text-3xl font-black tracking-tight tabular-nums ${stats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}
        </p>
        <p className="mt-1 text-xs font-semibold leading-5 text-neutral-500">Flujo del periodo</p>
      </div>
    </div>
  );
}

function LifeSnapshot({ alignment }: { alignment: any }) {
  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Vida en orden</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat label="Base" value={`${alignment.score}%`} />
        <MiniStat label="Con habito" value={alignment.activeSupportedGoals} />
        <MiniStat label="Diario" value={alignment.recentThoughts} />
      </div>
    </div>
  );
}

function RecentActivity({ records }: { records: any[] }) {
  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Ultimos registros</p>
      <div className="mt-4 space-y-3">
        {records.length > 0 ? records.map(record => (
          <div key={record.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-neutral-900">{record.description || record.category || 'Movimiento'}</p>
              <p className="text-[11px] font-semibold text-neutral-400">{record.category || 'Sin categoria'}</p>
            </div>
            <p className={`shrink-0 text-sm font-black ${record.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {record.type === 'income' ? '+' : '-'}{Number(record.amount || 0).toLocaleString()}
            </p>
          </div>
        )) : (
          <p className="rounded-2xl bg-neutral-50 p-4 text-sm font-semibold leading-6 text-neutral-500">Sin movimientos</p>
        )}
      </div>
    </div>
  );
}

function AccountsPanel({ accounts, onAdd }: { accounts: any[]; onAdd: () => void }) {
  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Cuentas</p>
          <h3 className="mt-1 text-lg font-black text-neutral-950">Cuentas</h3>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-950 text-white transition hover:bg-neutral-800"
          title="Agregar cuenta"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="space-y-2">
        {accounts.length > 0 ? accounts.slice(0, 5).map(account => (
          <div key={account.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-neutral-900">{account.name}</p>
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{account.type || 'cuenta'}</p>
            </div>
            <p className="text-sm font-black tabular-nums text-neutral-900">{Number(account.balance || 0).toLocaleString()} {account.currency}</p>
          </div>
        )) : (
          <p className="rounded-2xl bg-neutral-50 p-4 text-sm font-semibold leading-6 text-neutral-500">Sin cuentas</p>
        )}
      </div>
    </div>
  );
}

function NextStepsPanel({ alignment, stats, pendingFinance }: { alignment: any; stats: any; pendingFinance: number }) {
  const steps = [
    pendingFinance > 0 ? `Revisar ${pendingFinance} movimiento(s).` : null,
    alignment.goalsWithoutHabits.length > 0 ? 'Vincular objetivos con habitos.' : null,
    stats.net < 0 ? 'Revisar gastos del periodo.' : null,
    alignment.recentThoughts === 0 ? 'Registrar una entrada.' : null,
  ].filter(Boolean);

  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Proximos pasos</p>
      <div className="mt-4 space-y-3">
        {(steps.length > 0 ? steps : ['Sin pendientes urgentes.']).map((step, index) => (
          <div key={`${step}-${index}`} className="flex gap-3 rounded-2xl bg-neutral-50 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-[11px] font-black text-white">{index + 1}</span>
            <p className="text-sm font-semibold leading-5 text-neutral-650">{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <p className="text-xl font-black text-neutral-950">{value}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
    </div>
  );
}
