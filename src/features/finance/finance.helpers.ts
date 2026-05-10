import type { CatchupDraftInput, CreateFinancialTransactionInput } from './finance.types';

export const FINANCE_STALE_DAYS = 10;
export const CATCHUP_BLOCK_MINUTES = [15, 30, 45, 60, 75, 90];

export interface FinanceCatchupEstimateInput {
  pendingReviewCount: number;
  daysSinceLastUpdate: number | null;
  averageMinutesPerItem?: number | null;
}

export function getLastFinanceUpdate(transactions: { date?: any; createdAt?: any }[]) {
  const dates = transactions
    .map(transaction => transaction.date || transaction.createdAt)
    .map(timestamp => {
      if (typeof timestamp?.toDate === 'function') return timestamp.toDate();
      return timestamp ? new Date(timestamp) : null;
    })
    .filter((date): date is Date => Boolean(date) && !Number.isNaN(date.getTime()));

  if (dates.length === 0) return null;
  return dates.sort((a, b) => b.getTime() - a.getTime())[0];
}

export function getDaysSinceLastFinanceUpdate(transactions: { date?: any; createdAt?: any }[]) {
  const lastUpdate = getLastFinanceUpdate(transactions);
  if (!lastUpdate) return null;

  const diff = Date.now() - lastUpdate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function shouldSuggestFinanceCatchup(transactions: { date?: any; createdAt?: any }[], thresholdDays = FINANCE_STALE_DAYS) {
  const days = getDaysSinceLastFinanceUpdate(transactions);
  return days === null || days >= thresholdDays;
}

export function estimateFinanceCatchupMinutes(input: FinanceCatchupEstimateInput) {
  const pendingMinutes = input.pendingReviewCount * (input.averageMinutesPerItem || 3);
  const staleDays = input.daysSinceLastUpdate ?? FINANCE_STALE_DAYS;
  const staleMinutes = staleDays >= FINANCE_STALE_DAYS ? Math.min(45, Math.ceil(staleDays / 7) * 15) : 0;
  const rawMinutes = Math.max(15, pendingMinutes + staleMinutes);
  return roundToCatchupBlock(rawMinutes);
}

export function roundToCatchupBlock(minutes: number) {
  return CATCHUP_BLOCK_MINUTES.find(block => minutes <= block) || CATCHUP_BLOCK_MINUTES[CATCHUP_BLOCK_MINUTES.length - 1];
}

export function buildCatchupEstimatedTransaction(input: CatchupDraftInput): CreateFinancialTransactionInput {
  return {
    uid: input.uid,
    householdId: input.householdId,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    note: `Movimiento estimado para puesta al dia. Motivo: ${input.estimatedReason}`,
    category: input.category,
    type: 'expense',
    accountId: input.accountId || '',
    tags: ['puesta-al-dia', 'estimado'],
    date: input.date,
    source: 'catchup_estimate',
    confidence: 'estimated',
    status: 'needs_review',
    reconciliationBatchId: input.reconciliationBatchId,
    estimatedReason: input.estimatedReason,
    needsReview: true,
    isFixed: false,
    isConfirmed: false,
    generatedBy: input.uid,
    assignedTo: input.uid,
    paymentStatus: 'Pendiente',
  };
}
