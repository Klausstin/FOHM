import type { CreateFinancialTransactionInput } from './finance.types';

export type BalanceAffectingTransactionInput = Partial<CreateFinancialTransactionInput> & {
  accountBalanceApplied?: boolean;
};

export function getSourceAccountId(input: BalanceAffectingTransactionInput) {
  return input.accountId || input.sourceAccountId || '';
}

export function getBalanceTransactionType(input: BalanceAffectingTransactionInput) {
  return input.type || (input.kind === 'income' ? 'income' : input.kind === 'neutral' ? 'neutral' : 'expense');
}

export function shouldApplyTransactionToAccountBalances(input: BalanceAffectingTransactionInput) {
  const status = input.status || 'posted';
  const transactionType = getBalanceTransactionType(input);
  const amount = Number(input.amount || 0);
  const sourceAccountId = getSourceAccountId(input);

  if (!Number.isFinite(amount) || amount === 0) return false;
  if (status === 'ignored' || status === 'pending') return false;
  if (status === 'needs_review' && input.source !== 'catchup_estimate') return false;

  if (transactionType === 'neutral') return false;
  if (transactionType === 'transfer') return Boolean(sourceAccountId && input.toAccountId);

  return Boolean(sourceAccountId);
}
