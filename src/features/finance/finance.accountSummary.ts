// Resúmenes y actividad de cuentas: saldos por moneda, cola de conciliación y
// actividad por cuenta. Extraído de FinanceTracker.tsx (Fase A del refactor).
import { getAccountReconciliationInfo, getAccountBalanceDelta } from './finance.accounts';
import { parseFinanceDateValue } from './finance.format';
import type { PendingTransaction } from './finance.importTypes';

export interface AccountActivitySummary {
  movementCount: number;
  pendingCount: number;
  netActivity: number;
}

export function buildAccountBalanceSummary(accounts: any[]) {
  const byCurrency = new Map<string, {
    currency: string;
    liquidity: number;
    creditCardDebt: number;
    investments: number;
    netWorth: number;
    accountCount: number;
  }>();

  for (const account of accounts || []) {
    const currency = account.currency || 'ARS';
    const current = byCurrency.get(currency) || {
      currency,
      liquidity: 0,
      creditCardDebt: 0,
      investments: 0,
      netWorth: 0,
      accountCount: 0,
    };
    const balance = Number(account.balance || 0);
    const type = String(account.type || '').toLowerCase();

    current.accountCount += 1;
    if (type === 'credit_card') {
      current.creditCardDebt += Math.min(balance, 0);
    } else if (type === 'investment') {
      current.investments += balance;
      current.netWorth += balance;
    } else {
      current.liquidity += balance;
      current.netWorth += balance;
    }

    if (type === 'credit_card') {
      current.netWorth += balance;
    }

    byCurrency.set(currency, current);
  }

  return Array.from(byCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

export function buildAccountReconciliationQueue(accounts: any[]) {
  return (accounts || [])
    .map(account => ({
      account,
      reconciliation: getAccountReconciliationInfo(account),
    }))
    .filter(item => item.reconciliation.tone !== 'ok')
    .sort((a, b) => getReconciliationWeight(b.reconciliation.tone) - getReconciliationWeight(a.reconciliation.tone));
}

export function getReconciliationWeight(tone: string) {
  if (tone === 'danger') return 4;
  if (tone === 'warn') return 3;
  if (tone === 'neutral') return 2;
  return 1;
}

export function buildAccountActivityById(accounts: any[], finances: any[], pendingTransactions: PendingTransaction[] = []) {
  const entries = new Map<string, AccountActivitySummary>();

  for (const account of accounts || []) {
    entries.set(account.id, {
      movementCount: 0,
      pendingCount: 0,
      netActivity: 0,
    });
  }

  for (const finance of finances || []) {
    const sourceAccountId = finance.accountId || finance.sourceAccountId || '';
    const destinationAccountId = finance.toAccountId || '';
    const touchedAccountIds = [sourceAccountId, destinationAccountId].filter(Boolean);
    const hasReviewFlag = finance.isConfirmed === false || finance.needsReview || finance.status === 'pending' || finance.duplicateReason;

    for (const accountId of touchedAccountIds) {
      const current = entries.get(accountId);
      if (current && hasReviewFlag) current.pendingCount += 1;
    }

    if (!finance.accountBalanceApplied) continue;

    const transactionDate = parseFinanceDateValue(finance.date);
    for (const account of accounts || []) {
      const reconciledAt = parseFinanceDateValue(account.lastReconciledAt);
      if (reconciledAt && transactionDate && transactionDate <= reconciledAt) continue;

      let delta = 0;
      if (sourceAccountId === account.id) {
        delta += getAccountBalanceDelta({
          accountType: account.type,
          transactionType: finance.type,
          amount: Number(finance.amount || 0),
          direction: 'source',
        });
      }
      if (finance.type === 'transfer' && destinationAccountId === account.id) {
        delta += getAccountBalanceDelta({
          accountType: account.type,
          transactionType: finance.type,
          amount: Number(finance.amount || 0),
          direction: 'destination',
        });
      }

      if (delta !== 0) {
        const current = entries.get(account.id);
        if (current) {
          current.netActivity += delta;
          current.movementCount += 1;
        }
      }
    }
  }

  for (const transaction of pendingTransactions || []) {
    const accountId = transaction.accountId || transaction.sourceAccountId || '';
    const current = accountId ? entries.get(accountId) : null;
    if (current) current.pendingCount += 1;
  }

  return entries;
}
