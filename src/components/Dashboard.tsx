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
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, startOfYear, endOfYear } from 'date-fns';
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
    { id: 'trend', title: 'Tendencia de saldo', visible: true },
    { id: 'expenseStructure', title: 'Estructura de los gastos', visible: true },
    { id: 'recentRecords', title: 'Últimos registros', visible: true },
    { id: 'calendarSummary', title: 'Agenda & Productividad', visible: true },
    { id: 'goalsSummary', title: 'Objetivos 2026', visible: true },
  ];

  const [widgetsConfig, setWidgetsConfig] = useState<any[]>(user.dashboardWidgets || defaultWidgets);
  const [goals, setGoals] = useState<any[]>([]);

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
      where('uid', '==', user.uid),
      where('year', '==', 2026)
    );
    const unsubGoals = onSnapshot(qGoals, (snap) => {
      setGoals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'goals');
    });

    return () => {
      unsubAccounts();
      unsubFinances();
      unsubGoals();
    };
  }, [user.householdId]);

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

  return (
    <div className="space-y-8 bg-neutral-50/50 min-h-screen p-4 md:p-8 pb-24 md:pb-8">
      {/* Summary Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <h2 className="text-4xl font-black text-neutral-900 tracking-tight">Dashboard</h2>
          <p className="text-neutral-500 font-medium mt-1">Resumen de tu salud financiera</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="px-8 py-6 border-b sm:border-b-0 sm:border-r border-neutral-100 flex flex-col justify-center min-w-[240px]">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 block">Saldo Total</span>
            <div className="space-y-1">
              {(Object.entries(stats.balancesByCurrency || {})).map(([curr, val]: [string, any]) => (
                <div key={curr} className="flex items-center justify-between gap-4">
                  <span className="text-2xl font-black text-neutral-900 tabular-nums">
                    {val.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase bg-neutral-50 px-2 py-0.5 rounded tracking-wider">{curr}</span>
                </div>
              ))}
              {Object.keys(stats.balancesByCurrency).length === 0 && (
                <span className="text-xl font-black text-neutral-300">0.00</span>
              )}
            </div>
          </div>
          
          <div className="px-8 py-6 bg-neutral-50/30 flex flex-col justify-center min-w-[240px]">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 block">Flujo de Caja (Mes)</span>
            <div className="flex items-center justify-between gap-4">
              <span className={`text-2xl font-black tabular-nums ${stats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-neutral-400 uppercase bg-white px-2 py-0.5 rounded tracking-wider border border-neutral-100">ARS</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 w-full rounded-full bg-neutral-200/50 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(Math.abs((stats.net / (stats.income || 1)) * 100), 100)}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full rounded-full ${stats.net >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                />
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${stats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {stats.net >= 0 ? 'Saludable' : 'Crítico'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Date Selector & Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 border-b border-neutral-100 mb-8">
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
            Personalizar Dashboard
          </button>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(widgetsConfig || []).map((widget) => {
          if (!widget.visible) return null;
          
          switch (widget.id) {
            case 'balances':
              return (
                <div key="balances" className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200 flex flex-col">
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
                <div key="cashflow" className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200 lg:col-span-2">
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
            case 'trend':
              return (
                <div key="trend" className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200 lg:col-span-2">
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
                <div key="expenseStructure" className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200">
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
                <div key="recentRecords" className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200 lg:col-span-1">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <Briefcase size={16} className="text-neutral-400" />
                      Últimos registros
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
                <div key="calendarSummary" className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <Calendar size={16} className="text-neutral-400" />
                      Agenda & Productividad
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Análisis de tiempo</p>
                      <p className="text-sm text-neutral-600 leading-relaxed">
                        Conecta tu calendario para analizar cómo distribuyes tu tiempo y recibir sugerencias inteligentes.
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
                <div key="goalsSummary" className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 uppercase tracking-wider">
                      <Target size={16} className="text-neutral-400" />
                      Objetivos 2026
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
