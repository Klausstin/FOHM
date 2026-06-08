import type { FinancialTransactionRecord } from './finance.types';
import { buildMerchantRecurringKey, suggestMerchant } from './finance.merchants';
import { compareNominalAndRealChange, type InflationAwareChange } from './finance.realValue';

export interface RecurringExpenseInsight {
  key: string;
  label: string;
  category: string;
  averageAmount: number;
  currency: string;
  transactionIds: string[];
  monthsSeen: number;
  lastSeen?: Date | null;
  confidence: 'medium' | 'high';
  declaredFixed: boolean;
}

export interface UnusualExpenseInsight {
  id: string;
  label: string;
  amount: number;
  currency: string;
  category: string;
  date?: Date | null;
  reason: string;
}

export interface FinancialProjection {
  currency: string;
  monthlyNetAverage: number;
  monthlyExpenseAverage: number;
  monthlyIncomeAverage: number;
  projectedNet6Months: number;
  projectedNet12Months: number;
  inflationMonthlyRate?: number | null;
  inflationAdjustedExpense6Months?: number;
  inflationAdjustedExpense12Months?: number;
  expenseChangeRealVsPreviousMonth?: InflationAwareChange;
  incomeChangeRealVsPreviousMonth?: InflationAwareChange;
}

export interface MonthlyExpenseProfile {
  currency: string;
  fixedDeclared: number;
  recurringDetected: number;
  variable: number;
  unusual: number;
  totalExpenses: number;
  month?: string;
}

export interface PeriodCurrencyTotal {
  currency: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CategorySpendInsight {
  category: string;
  amount: number;
  currency: string;
  share: number;
}

export interface BeneficiarySpendInsight {
  label: string;
  beneficiaryType: string;
  amount: number;
  currency: string;
  share: number;
}

export interface ScopeSpendInsight {
  scope: string;
  amount: number;
  currency: string;
  share: number;
}

export interface PeriodFinanceDashboard {
  month?: string;
  currency: string;
  byCurrency: PeriodCurrencyTotal[];
  topCategories: CategorySpendInsight[];
  byBeneficiary: BeneficiarySpendInsight[];
  byScope: ScopeSpendInsight[];
  realExpenseRead?: string;
  realIncomeRead?: string;
}

export interface FinancialInsights {
  fixedDeclared: RecurringExpenseInsight[];
  recurringDetected: RecurringExpenseInsight[];
  unusualExpenses: UnusualExpenseInsight[];
  monthlyProfile: MonthlyExpenseProfile;
  projection: FinancialProjection;
  periodDashboard: PeriodFinanceDashboard;
  actionPriorities: FinanceActionPriority[];
  summaryBullets: string[];
  luzRead: string;
}

export interface FinanceActionPriority {
  id: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  type: 'quality' | 'recurring' | 'cashflow' | 'inflation' | 'unusual';
}

export function buildFinancialInsights(transactions: FinancialTransactionRecord[], inflationMonthlyRate?: number | null): FinancialInsights {
  const posted = transactions.filter(transaction => transaction.status !== 'ignored');
  const expenses = posted.filter(transaction => transaction.type === 'expense');
  const income = posted.filter(transaction => transaction.type === 'income');
  const monthly = buildMonthlyTotals(posted);
  const primaryCurrency = getPrimaryCurrency(posted);
  const primaryMonthly = monthly.filter(item => item.currency === primaryCurrency);
  const recurring = detectRecurringExpenses(expenses);
  const fixedDeclared = recurring.filter(item => item.declaredFixed);
  const recurringDetected = recurring.filter(item => !item.declaredFixed);
  const unusualExpenses = detectUnusualExpenses(expenses, recurring);
  const monthlyProfile = buildMonthlyExpenseProfile(expenses, recurring, unusualExpenses, primaryCurrency);
  const projection = buildProjection(primaryMonthly, primaryCurrency, inflationMonthlyRate);
  const periodDashboard = buildPeriodDashboard(monthly, expenses, projection, primaryCurrency);
  const actionPriorities = buildActionPriorities(monthlyProfile, recurringDetected, unusualExpenses, projection);
  const luzRead = buildLuzFinancialRead(monthlyProfile, recurringDetected, unusualExpenses, projection);

  const summaryBullets = [
    fixedDeclared.length > 0
      ? `${fixedDeclared.length} gasto(s) fijo(s) declarado(s).`
      : 'Todavia no hay gastos fijos declarados.',
    recurringDetected.length > 0
      ? `${recurringDetected.length} gasto(s) parecen recurrentes aunque no esten marcados como fijos.`
      : 'No detecte recurrentes nuevos con la data actual.',
    unusualExpenses.length > 0
      ? `${unusualExpenses.length} gasto(s) se salen del patron reciente.`
      : 'No hay gastos inusuales claros en el periodo analizado.',
    projection.monthlyNetAverage >= 0
      ? `Promedio mensual positivo: ${formatMoney(projection.monthlyNetAverage)}.`
      : `Promedio mensual negativo: ${formatMoney(projection.monthlyNetAverage)}.`,
  ];

  return {
    fixedDeclared,
    recurringDetected,
    unusualExpenses,
    monthlyProfile,
    projection,
    periodDashboard,
    actionPriorities,
    summaryBullets,
    luzRead,
  };
}

function buildActionPriorities(
  monthlyProfile: MonthlyExpenseProfile,
  recurringDetected: RecurringExpenseInsight[],
  unusualExpenses: UnusualExpenseInsight[],
  projection: FinancialProjection,
): FinanceActionPriority[] {
  const priorities: FinanceActionPriority[] = [];

  if (projection.monthlyNetAverage < 0) {
    priorities.push({
      id: 'cashflow-negative',
      title: 'Revisar caja',
      detail: `El promedio mensual proyecta ${formatMoney(projection.monthlyNetAverage)} ${projection.currency}. Antes de optimizar detalles, conviene entender que rubros estan empujando la salida.`,
      priority: 'high',
      type: 'cashflow',
    });
  }

  if (recurringDetected.length > 0) {
    const top = recurringDetected[0];
    priorities.push({
      id: 'recurring-detected',
      title: 'Marcar gastos habituales',
      detail: `${recurringDetected.length} gasto(s) parecen recurrentes. El mas claro es ${top.label} (${formatMoney(top.averageAmount)} ${top.currency}).`,
      priority: recurringDetected.length >= 3 ? 'high' : 'medium',
      type: 'recurring',
    });
  }

  if (unusualExpenses.length > 0) {
    const top = unusualExpenses[0];
    priorities.push({
      id: 'unusual-expenses',
      title: 'Mirar gastos fuera de patron',
      detail: `${top.label} sobresale en ${top.category}: ${formatMoney(top.amount)} ${top.currency}.`,
      priority: unusualExpenses.length >= 3 ? 'high' : 'medium',
      type: 'unusual',
    });
  }

  if (projection.expenseChangeRealVsPreviousMonth?.interpretation === 'real_increase') {
    priorities.push({
      id: 'real-expense-increase',
      title: 'Separar inflacion de gasto real',
      detail: projection.expenseChangeRealVsPreviousMonth.read,
      priority: 'medium',
      type: 'inflation',
    });
  }

  if (monthlyProfile.totalExpenses > 0) {
    const fixedLike = monthlyProfile.fixedDeclared + monthlyProfile.recurringDetected;
    const fixedShare = fixedLike / monthlyProfile.totalExpenses;
    if (fixedShare >= 0.65) {
      priorities.push({
        id: 'fixed-share-high',
        title: 'Entender gastos rigidos',
        detail: `${Math.round(fixedShare * 100)}% del gasto del mes parece fijo o recurrente. Esto define tu margen real de decision.`,
        priority: 'medium',
        type: 'quality',
      });
    }
  }

  if (priorities.length === 0) {
    priorities.push({
      id: 'keep-loading',
      title: 'Seguir cargando data',
      detail: 'No hay una tension fuerte todavia. El proximo valor viene de completar mas resumenes y sostener la calidad de categorias.',
      priority: 'low',
      type: 'quality',
    });
  }

  return priorities.slice(0, 4);
}

function buildMonthlyExpenseProfile(
  expenses: FinancialTransactionRecord[],
  recurring: RecurringExpenseInsight[],
  unusualExpenses: UnusualExpenseInsight[],
  currency: string,
): MonthlyExpenseProfile {
  const usableExpenses = expenses
    .map(expense => ({ expense, date: toDate(expense.date) }))
    .filter(item => item.date && normalizeCurrency(item.expense.currency) === currency);
  const latestMonth = usableExpenses
    .map(item => monthKey(item.date))
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!latestMonth) {
    return { currency, fixedDeclared: 0, recurringDetected: 0, variable: 0, unusual: 0, totalExpenses: 0 };
  }

  const recurringByKey = new Map(recurring.map(item => [item.key, item]));
  const unusualIds = new Set(unusualExpenses.map(item => item.id));
  const monthExpenses = usableExpenses
    .filter(item => monthKey(item.date) === latestMonth)
    .map(item => item.expense);

  let fixedDeclared = 0;
  let recurringDetected = 0;
  let variable = 0;
  let unusual = 0;

  for (const expense of monthExpenses) {
    const amount = Number(expense.amount || 0);
    const key = buildRecurringKey(expense);
    const recurringItem = key ? recurringByKey.get(key) : undefined;

    if (unusualIds.has(expense.id)) {
      unusual += amount;
    } else if (expense.isFixed || recurringItem?.declaredFixed) {
      fixedDeclared += amount;
    } else if (recurringItem) {
      recurringDetected += amount;
    } else {
      variable += amount;
    }
  }

  return {
    currency,
    fixedDeclared,
    recurringDetected,
    variable,
    unusual,
    totalExpenses: fixedDeclared + recurringDetected + variable + unusual,
    month: latestMonth,
  };
}

function buildPeriodDashboard(
  monthly: { month: string; currency: string; income: number; expenses: number; net: number }[],
  expenses: FinancialTransactionRecord[],
  projection: FinancialProjection,
  primaryCurrency: string,
): PeriodFinanceDashboard {
  const latestMonth = monthly.map(item => item.month).sort().at(-1);
  const byCurrency = latestMonth
    ? monthly
        .filter(item => item.month === latestMonth)
        .sort((a, b) => Math.abs(b.expenses + b.income) - Math.abs(a.expenses + a.income))
        .map(({ currency, income, expenses, net }) => ({ currency, income, expenses, net }))
    : [];

  const topCategories = buildTopCategoriesForMonth(expenses, latestMonth, primaryCurrency);
  const byBeneficiary = buildBeneficiaryBreakdownForMonth(expenses, latestMonth, primaryCurrency);
  const byScope = buildScopeBreakdownForMonth(expenses, latestMonth, primaryCurrency);

  return {
    month: latestMonth,
    currency: primaryCurrency,
    byCurrency,
    topCategories,
    byBeneficiary,
    byScope,
    realExpenseRead: projection.expenseChangeRealVsPreviousMonth?.read,
    realIncomeRead: projection.incomeChangeRealVsPreviousMonth?.read,
  };
}

function buildTopCategoriesForMonth(expenses: FinancialTransactionRecord[], month?: string, currency = 'ARS') {
  if (!month) return [];
  const totals = new Map<string, number>();
  let total = 0;

  for (const expense of expenses) {
    const date = toDate(expense.date);
    if (monthKey(date) !== month || normalizeCurrency(expense.currency) !== currency) continue;
    const category = expense.category || 'Sin categoria';
    const amount = Number(expense.amount || 0);
    totals.set(category, (totals.get(category) || 0) + amount);
    total += amount;
  }

  return Array.from(totals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, amount]) => ({
      category,
      amount,
      currency,
      share: total > 0 ? amount / total : 0,
    }));
}

function buildBeneficiaryBreakdownForMonth(expenses: FinancialTransactionRecord[], month?: string, currency = 'ARS') {
  if (!month) return [];
  const totals = new Map<string, { label: string; beneficiaryType: string; amount: number }>();
  let total = 0;

  for (const expense of expenses) {
    const date = toDate(expense.date);
    if (monthKey(date) !== month || normalizeCurrency(expense.currency) !== currency) continue;

    const label = expense.beneficiaryLabel || legacyBeneficiaryLabel(expense);
    const beneficiaryType = expense.beneficiaryType || legacyBeneficiaryType(expense);
    const amount = Number(expense.amount || 0);
    const key = `${beneficiaryType}:${label}`;
    const current = totals.get(key) || { label, beneficiaryType, amount: 0 };
    current.amount += amount;
    totals.set(key, current);
    total += amount;
  }

  return Array.from(totals.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map(item => ({
      ...item,
      currency,
      share: total > 0 ? item.amount / total : 0,
    }));
}

function buildScopeBreakdownForMonth(expenses: FinancialTransactionRecord[], month?: string, currency = 'ARS') {
  if (!month) return [];
  const totals = new Map<string, number>();
  let total = 0;

  for (const expense of expenses) {
    const date = toDate(expense.date);
    if (monthKey(date) !== month || normalizeCurrency(expense.currency) !== currency) continue;

    const scope = expense.scope || legacyScope(expense);
    const amount = Number(expense.amount || 0);
    totals.set(scope, (totals.get(scope) || 0) + amount);
    total += amount;
  }

  return Array.from(totals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([scope, amount]) => ({
      scope,
      amount,
      currency,
      share: total > 0 ? amount / total : 0,
    }));
}

function buildLuzFinancialRead(
  monthlyProfile: MonthlyExpenseProfile,
  recurringDetected: RecurringExpenseInsight[],
  unusualExpenses: UnusualExpenseInsight[],
  projection: FinancialProjection,
) {
  if (monthlyProfile.totalExpenses === 0) {
    return 'Todavia falta data para leer tu patron financiero. Subi resumenes o registra movimientos para que VEO empiece a aprender.';
  }

  const fixedLike = monthlyProfile.fixedDeclared + monthlyProfile.recurringDetected;
  const fixedShare = fixedLike / monthlyProfile.totalExpenses;
  const signals: string[] = [];

  if (recurringDetected.length > 0) {
    signals.push(`${recurringDetected.length} gasto(s) parecen habituales aunque todavia no los marcaste como fijos`);
  }
  if (unusualExpenses.length > 0) {
    signals.push(`${unusualExpenses.length} gasto(s) sobresalen del patron`);
  }
  if (fixedShare >= 0.65) {
    signals.push('la parte rigida de tus gastos pesa fuerte este mes');
  } else if (fixedShare <= 0.3) {
    signals.push('todavia hay margen para entender mejor que gastos son realmente estructurales');
  }
  if (projection.monthlyNetAverage < 0) {
    signals.push('el promedio reciente proyecta perdida si no cambia nada');
  }
  if (projection.expenseChangeRealVsPreviousMonth?.interpretation === 'real_increase') {
    signals.push('tus gastos subieron en terminos reales contra el mes anterior');
  }
  if (projection.incomeChangeRealVsPreviousMonth?.interpretation === 'real_decrease') {
    signals.push('tus ingresos cayeron en terminos reales contra el mes anterior');
  }

  if (signals.length === 0) {
    return 'Con la data actual, tus gastos no muestran tensiones fuertes. Conviene seguir cargando resumenes para confirmar si el patron se sostiene.';
  }

  return `Con la data actual, Luz ve que ${signals.join(', ')}.`;
}

function detectRecurringExpenses(expenses: FinancialTransactionRecord[]) {
  const groups = new Map<string, FinancialTransactionRecord[]>();

  for (const expense of expenses) {
    const key = buildRecurringKey(expense);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), expense]);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const months = new Set(items.map(item => monthKey(toDate(item.date))).filter(Boolean));
      const amounts = items.map(item => Number(item.amount || 0)).filter(amount => amount > 0);
      const averageAmount = average(amounts);
      const declaredFixed = items.some(item => Boolean(item.isFixed));
      const lastSeen = items
        .map(item => toDate(item.date))
        .filter(Boolean)
        .sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0] || null;
      const first = items[0];

      return {
        key,
        label: displayRecurringLabel(first),
        category: first.category || 'Sin categoria',
        averageAmount,
        currency: first.currency || 'ARS',
        transactionIds: items.map(item => item.id).filter(Boolean),
        monthsSeen: months.size,
        lastSeen,
        confidence: months.size >= 4 ? 'high' as const : 'medium' as const,
        declaredFixed,
      };
    })
    .filter(item => item.declaredFixed || item.monthsSeen >= 3)
    .sort((a, b) => b.monthsSeen - a.monthsSeen || b.averageAmount - a.averageAmount)
    .slice(0, 12);
}

function detectUnusualExpenses(expenses: FinancialTransactionRecord[], recurring: RecurringExpenseInsight[]) {
  const recurringKeys = new Set(recurring.map(item => item.key));
  const categoryAverages = new Map<string, number>();
  const byCategory = new Map<string, number[]>();

  for (const expense of expenses) {
    const category = expense.category || 'Sin categoria';
    byCategory.set(category, [...(byCategory.get(category) || []), Number(expense.amount || 0)]);
  }

  for (const [category, amounts] of byCategory.entries()) {
    categoryAverages.set(category, average(amounts));
  }

  return expenses
    .filter(expense => {
      const amount = Number(expense.amount || 0);
      const avg = categoryAverages.get(expense.category || 'Sin categoria') || 0;
      const recurringKey = buildRecurringKey(expense);
      return amount > 0 && !recurringKeys.has(recurringKey || '') && avg > 0 && amount >= avg * 2.2 && amount >= 10000;
    })
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 6)
    .map(expense => ({
      id: expense.id,
      label: expense.description || expense.category || 'Gasto inusual',
      amount: Number(expense.amount || 0),
      currency: expense.currency || 'ARS',
      category: expense.category || 'Sin categoria',
      date: toDate(expense.date),
      reason: 'Supera con claridad el promedio reciente de su categoria.',
    }));
}

function buildMonthlyTotals(transactions: FinancialTransactionRecord[]) {
  const totals = new Map<string, { month: string; currency: string; income: number; expenses: number }>();

  for (const transaction of transactions) {
    const month = monthKey(toDate(transaction.date));
    if (!month) continue;
    const currency = normalizeCurrency(transaction.currency);
    const key = `${month}:${currency}`;
    const current = totals.get(key) || { month, currency, income: 0, expenses: 0 };
    if (transaction.type === 'income') current.income += Number(transaction.amount || 0);
    if (transaction.type === 'expense') current.expenses += Number(transaction.amount || 0);
    totals.set(key, current);
  }

  return Array.from(totals.values())
    .sort((a, b) => `${a.month}:${a.currency}`.localeCompare(`${b.month}:${b.currency}`))
    .slice(-12)
    .map(total => ({ ...total, net: total.income - total.expenses }));
}

function buildProjection(
  monthly: { income: number; expenses: number; net: number }[],
  currency: string,
  inflationMonthlyRate?: number | null,
): FinancialProjection {
  const sample = monthly.slice(-6);
  const monthlyIncomeAverage = average(sample.map(item => item.income));
  const monthlyExpenseAverage = average(sample.map(item => item.expenses));
  const monthlyNetAverage = average(sample.map(item => item.net));
  const previousMonth = monthly.at(-2);
  const currentMonth = monthly.at(-1);

  return {
    currency,
    monthlyNetAverage,
    monthlyExpenseAverage,
    monthlyIncomeAverage,
    projectedNet6Months: monthlyNetAverage * 6,
    projectedNet12Months: monthlyNetAverage * 12,
    inflationMonthlyRate,
    inflationAdjustedExpense6Months: inflationMonthlyRate ? projectInflatedMonthlyValue(monthlyExpenseAverage, inflationMonthlyRate, 6) : undefined,
    inflationAdjustedExpense12Months: inflationMonthlyRate ? projectInflatedMonthlyValue(monthlyExpenseAverage, inflationMonthlyRate, 12) : undefined,
    expenseChangeRealVsPreviousMonth: previousMonth && currentMonth
      ? compareNominalAndRealChange('Gasto mensual', previousMonth.expenses, currentMonth.expenses, inflationMonthlyRate)
      : undefined,
    incomeChangeRealVsPreviousMonth: previousMonth && currentMonth
      ? compareNominalAndRealChange('Ingreso mensual', previousMonth.income, currentMonth.income, inflationMonthlyRate)
      : undefined,
  };
}

function buildRecurringKey(transaction: FinancialTransactionRecord) {
  const key = transaction.merchantKey || buildMerchantRecurringKey(transaction.description || '', transaction.category || '');
  return key ? `${key}:${normalizeCurrency(transaction.currency)}` : '';
}

function displayRecurringLabel(transaction: FinancialTransactionRecord) {
  if (transaction.merchantName) return transaction.merchantName;
  const merchant = suggestMerchant(transaction.description || '');
  if (merchant.confidence >= 0.8) return merchant.merchantName;
  return transaction.description || transaction.category || 'Gasto recurrente';
}

function projectInflatedMonthlyValue(monthlyValue: number, monthlyInflationRate: number, months: number) {
  let projected = 0;
  for (let month = 1; month <= months; month += 1) {
    projected += monthlyValue * Math.pow(1 + monthlyInflationRate, month);
  }
  return projected;
}

function toDate(value: any) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date?: Date | null) {
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getPrimaryCurrency(transactions: FinancialTransactionRecord[]) {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense' && transaction.type !== 'income') continue;
    const currency = normalizeCurrency(transaction.currency);
    totals.set(currency, (totals.get(currency) || 0) + Math.abs(Number(transaction.amount || 0)));
  }
  return Array.from(totals.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] || 'ARS';
}

function legacyBeneficiaryLabel(transaction: FinancialTransactionRecord) {
  if (transaction.assignedTo === 'Ambos') return 'Pareja';
  return transaction.beneficiaryLabel || 'Familia';
}

function legacyBeneficiaryType(transaction: FinancialTransactionRecord) {
  if (transaction.assignedTo === 'Ambos') return 'couple';
  return transaction.beneficiaryType || 'family';
}

function legacyScope(transaction: FinancialTransactionRecord) {
  if (transaction.assignedTo === 'Ambos') return 'pareja';
  return transaction.scope || 'familia';
}

function normalizeCurrency(value?: string | null) {
  return String(value || 'ARS').toUpperCase();
}

function average(values: number[]) {
  const usable = values.filter(value => Number.isFinite(value));
  if (usable.length === 0) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
