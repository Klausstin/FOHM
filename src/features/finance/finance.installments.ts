// Proyección de compras en cuotas: agrupa movimientos en cuotas, estima lo que
// falta pagar por mes y por moneda. Extraído de FinanceTracker.tsx (Fase A).
import { parseFinanceTraceNote } from './finance.trace';
import { parseFinanceDateValue } from './finance.format';
import { normalizeDuplicateText } from './finance.duplicates';

export interface InstallmentForecastItem {
  key: string;
  label: string;
  description: string;
  accountName: string;
  amount: number;
  currency: string;
  currentInstallment: number;
  totalInstallments: number;
  remainingCount: number;
  remainingAmount: number;
  lastSeenAt: Date;
  nextDueDate: Date;
  source: string;
}

export interface InstallmentMonthlyTotal {
  monthKey: string;
  currency: string;
  amount: number;
  count: number;
}

export function buildInstallmentForecast(finances: any[], accounts: any[]) {
  const byPurchase = new Map<string, InstallmentForecastItem>();

  for (const finance of finances || []) {
    if (finance.status === 'ignored' || finance.type !== 'expense') continue;
    const trace = parseFinanceTraceNote(finance.note);
    const installment = parseInstallmentLabelValue(trace.installmentLabel || finance.installmentLabel);
    if (!installment || installment.total <= installment.number) continue;

    const date = parseFinanceDateValue(finance.date);
    const amount = Number(finance.amount || 0);
    if (!date || !amount) continue;

    const accountId = finance.sourceAccountId || finance.accountId || '';
    const account = accounts.find(item => item.id === accountId);
    const originalText = trace.originalConcept || finance.originalDescription || finance.description || finance.merchantName || 'Compra en cuotas';
    const baseText = stripInstallmentText(originalText);
    const purchaseKey = [
      finance.merchantKey || normalizeDuplicateText(baseText),
      Math.round(amount * 100),
      finance.currency || 'ARS',
      installment.total,
      accountId,
    ].join('|');
    const existing = byPurchase.get(purchaseKey);
    const shouldReplace = !existing ||
      installment.number > existing.currentInstallment ||
      (installment.number === existing.currentInstallment && date > existing.lastSeenAt);

    if (!shouldReplace) continue;

    const remainingCount = installment.total - installment.number;
    const nextDueDate = addMonthsPreservingDay(date, 1);

    byPurchase.set(purchaseKey, {
      key: purchaseKey,
      label: finance.merchantName || baseText || finance.description || 'Compra en cuotas',
      description: baseText || originalText,
      accountName: account?.name || '',
      amount,
      currency: finance.currency || 'ARS',
      currentInstallment: installment.number,
      totalInstallments: installment.total,
      remainingCount,
      remainingAmount: remainingCount * amount,
      lastSeenAt: date,
      nextDueDate,
      source: finance.importSource || trace.importedFile || 'Resumen',
    });
  }

  const items = Array.from(byPurchase.values())
    .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
    .slice(0, 12);
  const monthlyMap = new Map<string, InstallmentMonthlyTotal>();
  const remainingByCurrency = new Map<string, number>();

  for (const item of items) {
    remainingByCurrency.set(item.currency, (remainingByCurrency.get(item.currency) || 0) + item.remainingAmount);

    for (let offset = 1; offset <= item.remainingCount; offset += 1) {
      const dueDate = addMonthsPreservingDay(item.lastSeenAt, offset);
      const monthKey = toMonthKey(dueDate);
      const key = `${monthKey}|${item.currency}`;
      const current = monthlyMap.get(key) || { monthKey, currency: item.currency, amount: 0, count: 0 };
      current.amount += item.amount;
      current.count += 1;
      monthlyMap.set(key, current);
    }
  }

  const monthlyTotals = Array.from(monthlyMap.values())
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(0, 6);
  const totalRemainingByCurrency = Array.from(remainingByCurrency.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return {
    items,
    monthlyTotals,
    totalRemainingByCurrency,
    activeCount: items.length,
  };
}

export function parseInstallmentLabelValue(value?: string) {
  const match = /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(String(value || ''));
  if (!match) return null;
  const number = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(number) || !Number.isFinite(total) || number < 1 || total < 2 || number > total) return null;
  return { number, total };
}

export function stripInstallmentText(value: string) {
  return String(value || '')
    .replace(/\b(?:CUOTA|CTA)\s*\d{1,2}\s*(?:DE|\/)\s*\d{1,2}\b/gi, '')
    .replace(/(?:^|\s)\d{1,2}\s*\/\s*\d{1,2}(?:\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function addMonthsPreservingDay(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
