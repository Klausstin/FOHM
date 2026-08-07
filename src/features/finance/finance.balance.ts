import type { CreateFinancialTransactionInput } from './finance.types';
import { getAccountBalanceDelta } from './finance.accounts';

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

export function getBalanceAccountIds(input: BalanceAffectingTransactionInput) {
  if (!shouldApplyTransactionToAccountBalances(input)) return [];

  const ids = [getSourceAccountId(input)];
  if (getBalanceTransactionType(input) === 'transfer' && input.toAccountId) {
    ids.push(input.toAccountId);
  }

  return Array.from(new Set(ids.filter(Boolean)));
}

export function calculateTransactionBalanceDeltas(
  input: BalanceAffectingTransactionInput,
  accountTypes: Record<string, string | undefined>,
  multiplier = 1,
) {
  if (!shouldApplyTransactionToAccountBalances(input)) return {} as Record<string, number>;

  const transactionType = getBalanceTransactionType(input);
  const sourceAccountId = getSourceAccountId(input);
  const deltas: Record<string, number> = {};

  const addDelta = (accountId: string, amount: number, direction: 'source' | 'destination') => {
    const accountType = accountTypes[accountId];
    if (!accountType) {
      throw new Error(`No existe la cuenta financiera ${accountId}.`);
    }

    const delta = getAccountBalanceDelta({
      accountType,
      transactionType,
      amount,
      direction,
    }) * multiplier;
    deltas[accountId] = (deltas[accountId] || 0) + delta;
  };

  addDelta(sourceAccountId, Number(input.amount || 0), 'source');

  if (transactionType === 'transfer' && input.toAccountId) {
    const destinationAmount = Number.isFinite(Number(input.settlementAmount))
      ? Number(input.settlementAmount)
      : Number(input.amount || 0);
    addDelta(input.toAccountId, destinationAmount, 'destination');
  }

  return deltas;
}

export function calculateBalanceTransitionDeltas(
  previous: BalanceAffectingTransactionInput | null,
  next: BalanceAffectingTransactionInput | null,
  accountTypes: Record<string, string | undefined>,
  applyNext = true,
) {
  const deltas: Record<string, number> = {};
  const merge = (source: Record<string, number>) => {
    Object.entries(source).forEach(([accountId, delta]) => {
      deltas[accountId] = (deltas[accountId] || 0) + delta;
    });
  };

  if (previous?.accountBalanceApplied) {
    merge(calculateTransactionBalanceDeltas(previous, accountTypes, -1));
  }
  if (next && applyNext && shouldApplyTransactionToAccountBalances(next)) {
    merge(calculateTransactionBalanceDeltas(next, accountTypes));
  }

  return deltas;
}
