import type { CatchupDraftInput, CreateFinancialTransactionInput } from './finance.types';

export const FINANCE_STALE_DAYS = 10;

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
