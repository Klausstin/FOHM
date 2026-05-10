import type { FinancialTransactionRecord } from './finance.types';
import { buildMerchantRecurringKey, suggestMerchant } from './finance.merchants';

export interface RecurringExpenseInsight {
  key: string;
  label: string;
  category: string;
  averageAmount: number;
  currency: string;
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
  monthlyNetAverage: number;
  monthlyExpenseAverage: number;
  monthlyIncomeAverage: number;
  projectedNet6Months: number;
  projectedNet12Months: number;
  inflationMonthlyRate?: number | null;
  inflationAdjustedExpense6Months?: number;
  inflationAdjustedExpense12Months?: number;
}

export interface FinancialInsights {
  fixedDeclared: RecurringExpenseInsight[];
  recurringDetected: RecurringExpenseInsight[];
  unusualExpenses: UnusualExpenseInsight[];
  projection: FinancialProjection;
  summaryBullets: string[];
}

export function buildFinancialInsights(transactions: FinancialTransactionRecord[], inflationMonthlyRate?: number | null): FinancialInsights {
  const posted = transactions.filter(transaction => transaction.status !== 'ignored');
  const expenses = posted.filter(transaction => transaction.type === 'expense');
  const income = posted.filter(transaction => transaction.type === 'income');
  const monthly = buildMonthlyTotals(posted);
  const recurring = detectRecurringExpenses(expenses);
  const fixedDeclared = recurring.filter(item => item.declaredFixed);
  const recurringDetected = recurring.filter(item => !item.declaredFixed);
  const unusualExpenses = detectUnusualExpenses(expenses, recurring);
  const projection = buildProjection(monthly, inflationMonthlyRate);

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
    projection,
    summaryBullets,
  };
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
  const totals = new Map<string, { income: number; expenses: number }>();

  for (const transaction of transactions) {
    const key = monthKey(toDate(transaction.date));
    if (!key) continue;
    const current = totals.get(key) || { income: 0, expenses: 0 };
    if (transaction.type === 'income') current.income += Number(transaction.amount || 0);
    if (transaction.type === 'expense') current.expenses += Number(transaction.amount || 0);
    totals.set(key, current);
  }

  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, total]) => ({ month, ...total, net: total.income - total.expenses }));
}

function buildProjection(monthly: { income: number; expenses: number; net: number }[], inflationMonthlyRate?: number | null): FinancialProjection {
  const sample = monthly.slice(-6);
  const monthlyIncomeAverage = average(sample.map(item => item.income));
  const monthlyExpenseAverage = average(sample.map(item => item.expenses));
  const monthlyNetAverage = average(sample.map(item => item.net));

  return {
    monthlyNetAverage,
    monthlyExpenseAverage,
    monthlyIncomeAverage,
    projectedNet6Months: monthlyNetAverage * 6,
    projectedNet12Months: monthlyNetAverage * 12,
    inflationMonthlyRate,
    inflationAdjustedExpense6Months: inflationMonthlyRate ? projectInflatedMonthlyValue(monthlyExpenseAverage, inflationMonthlyRate, 6) : undefined,
    inflationAdjustedExpense12Months: inflationMonthlyRate ? projectInflatedMonthlyValue(monthlyExpenseAverage, inflationMonthlyRate, 12) : undefined,
  };
}

function buildRecurringKey(transaction: FinancialTransactionRecord) {
  return transaction.merchantKey || buildMerchantRecurringKey(transaction.description || '', transaction.category || '');
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
