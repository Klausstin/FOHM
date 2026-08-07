import { findBestAccountForImportedTransaction } from '../src/features/finance/finance.accounts.ts';
import {
  calculateBalanceTransitionDeltas,
  calculateTransactionBalanceDeltas,
  shouldApplyTransactionToAccountBalances,
  type BalanceAffectingTransactionInput,
} from '../src/features/finance/finance.balance.ts';
import { findLikelyDuplicateMatch } from '../src/features/finance/finance.duplicates.ts';

type AcceptanceAccount = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  institution?: string;
  statementLabel?: string;
};

type StoredTransaction = BalanceAffectingTransactionInput & {
  id: string;
  accountBalanceApplied: boolean;
};

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(value: string, expected: string, label: string) {
  if (!value.includes(expected)) {
    throw new Error(`${label}: expected "${value}" to include "${expected}"`);
  }
}

class AcceptanceLedger {
  private accounts = new Map<string, AcceptanceAccount>();
  private transactions = new Map<string, StoredTransaction>();

  constructor(accounts: AcceptanceAccount[]) {
    accounts.forEach(account => this.accounts.set(account.id, { ...account }));
  }

  create(id: string, input: BalanceAffectingTransactionInput) {
    if (this.transactions.has(id)) throw new Error(`El movimiento ${id} ya existe.`);

    const shouldApply = shouldApplyTransactionToAccountBalances(input);
    const deltas = shouldApply
      ? calculateTransactionBalanceDeltas(input, this.getAccountTypes())
      : {};

    this.applyDeltas(deltas);
    this.transactions.set(id, { ...input, id, accountBalanceApplied: shouldApply });
  }

  update(id: string, patch: BalanceAffectingTransactionInput) {
    const previous = this.transactions.get(id);
    if (!previous) throw new Error(`El movimiento ${id} no existe.`);

    const next = { ...previous, ...patch };
    const shouldApply = shouldApplyTransactionToAccountBalances(next);
    const deltas = calculateBalanceTransitionDeltas(previous, next, this.getAccountTypes(), shouldApply);

    this.applyDeltas(deltas);
    this.transactions.set(id, { ...next, accountBalanceApplied: shouldApply });
  }

  delete(id: string) {
    const previous = this.transactions.get(id);
    if (!previous) return;

    const deltas = calculateBalanceTransitionDeltas(previous, null, this.getAccountTypes());
    this.applyDeltas(deltas);
    this.transactions.delete(id);
  }

  balance(accountId: string) {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`No existe la cuenta ${accountId}.`);
    return account.balance;
  }

  transaction(id: string) {
    return this.transactions.get(id);
  }

  private getAccountTypes() {
    return Object.fromEntries(Array.from(this.accounts, ([id, account]) => [id, account.type]));
  }

  private applyDeltas(deltas: Record<string, number>) {
    const nextBalances = new Map<string, number>();

    Object.entries(deltas).forEach(([accountId, delta]) => {
      const account = this.accounts.get(accountId);
      if (!account) throw new Error(`No existe la cuenta ${accountId}.`);
      nextBalances.set(accountId, account.balance + delta);
    });

    nextBalances.forEach((balance, accountId) => {
      const account = this.accounts.get(accountId);
      if (account) account.balance = balance;
    });
  }
}

const accounts: AcceptanceAccount[] = [
  { id: 'bbva-ars', name: 'BBVA (ARS)', type: 'bank', currency: 'ARS', balance: 1_000_000, institution: 'BBVA', statementLabel: 'Caja de ahorro ARS' },
  { id: 'cash-ars', name: 'Agustin ARS', type: 'cash', currency: 'ARS', balance: 50_000 },
  { id: 'mp-ars', name: 'Agustin MP (ARS)', type: 'wallet', currency: 'ARS', balance: 100_000, institution: 'Mercado Pago' },
  { id: 'bbva-usd', name: 'BBVA (USD)', type: 'bank', currency: 'USD', balance: 2_000, institution: 'BBVA', statementLabel: 'Caja de ahorro USD' },
  { id: 'bbva-visa', name: 'BBVA - Visa (ARS)', type: 'credit_card', currency: 'ARS', balance: 0, institution: 'BBVA', statementLabel: 'Visa' },
  { id: 'bbva-mc', name: 'BBVA - MC (ARS)', type: 'credit_card', currency: 'ARS', balance: 0, institution: 'BBVA', statementLabel: 'Mastercard' },
];

const ledger = new AcceptanceLedger(accounts);

ledger.create('salary', {
  amount: 200_000,
  currency: 'ARS',
  type: 'income',
  accountId: 'bbva-ars',
  status: 'posted',
});
assertClose(ledger.balance('bbva-ars'), 1_200_000, 'income increases bank balance');

ledger.create('lunch', {
  amount: 30_000,
  currency: 'ARS',
  type: 'expense',
  accountId: 'bbva-ars',
  status: 'posted',
});
assertClose(ledger.balance('bbva-ars'), 1_170_000, 'expense decreases bank balance');

ledger.update('lunch', { amount: 18_000, accountId: 'cash-ars' });
assertClose(ledger.balance('bbva-ars'), 1_200_000, 'editing account restores previous bank impact');
assertClose(ledger.balance('cash-ars'), 32_000, 'editing account applies expense to cash');

ledger.delete('lunch');
assertClose(ledger.balance('cash-ars'), 50_000, 'deleting expense restores cash balance');

ledger.create('internal-transfer', {
  amount: 100_000,
  currency: 'ARS',
  type: 'transfer',
  neutralType: 'internal_transfer',
  accountId: 'bbva-ars',
  toAccountId: 'mp-ars',
  status: 'posted',
});
assertClose(ledger.balance('bbva-ars'), 1_100_000, 'transfer decreases origin');
assertClose(ledger.balance('mp-ars'), 200_000, 'transfer increases destination');

ledger.update('internal-transfer', { amount: 80_000 });
assertClose(ledger.balance('bbva-ars'), 1_120_000, 'editing transfer applies only origin difference');
assertClose(ledger.balance('mp-ars'), 180_000, 'editing transfer applies only destination difference');

ledger.create('currency-exchange', {
  amount: 500,
  currency: 'USD',
  settlementAmount: 720_000,
  settlementCurrency: 'ARS',
  fxRate: 1_440,
  type: 'transfer',
  neutralType: 'currency_exchange',
  accountId: 'bbva-usd',
  toAccountId: 'bbva-ars',
  status: 'posted',
});
assertClose(ledger.balance('bbva-usd'), 1_500, 'currency exchange uses source amount');
assertClose(ledger.balance('bbva-ars'), 1_840_000, 'currency exchange uses settlement amount');

ledger.create('card-purchase', {
  amount: 120_000,
  currency: 'ARS',
  type: 'expense',
  accountId: 'bbva-visa',
  status: 'posted',
});
assertClose(ledger.balance('bbva-visa'), -120_000, 'credit-card purchase creates debt');

ledger.create('card-payment', {
  amount: 120_000,
  currency: 'ARS',
  type: 'transfer',
  neutralType: 'credit_card_payment',
  accountId: 'bbva-ars',
  toAccountId: 'bbva-visa',
  status: 'posted',
});
assertClose(ledger.balance('bbva-ars'), 1_720_000, 'card payment decreases bank balance');
assertClose(ledger.balance('bbva-visa'), 0, 'card payment cancels debt without another expense');

ledger.create('pending-expense', {
  amount: 50_000,
  currency: 'ARS',
  type: 'expense',
  accountId: 'bbva-ars',
  status: 'pending',
});
assertClose(ledger.balance('bbva-ars'), 1_720_000, 'pending expense does not affect balance');
assertEqual(ledger.transaction('pending-expense')?.accountBalanceApplied, false, 'pending expense remains unapplied');

ledger.update('pending-expense', { status: 'posted' });
assertClose(ledger.balance('bbva-ars'), 1_670_000, 'posting pending expense applies balance once');

ledger.update('pending-expense', { status: 'posted' });
assertClose(ledger.balance('bbva-ars'), 1_670_000, 'saving posted expense twice does not duplicate impact');

ledger.delete('pending-expense');
assertClose(ledger.balance('bbva-ars'), 1_720_000, 'deleting posted expense reverses impact');

const balanceBeforeInvalidTransfer = ledger.balance('bbva-ars');
let invalidTransferFailed = false;
try {
  ledger.create('invalid-transfer', {
    amount: 10_000,
    currency: 'ARS',
    type: 'transfer',
    accountId: 'bbva-ars',
    toAccountId: 'missing-account',
    status: 'posted',
  });
} catch {
  invalidTransferFailed = true;
}
assertEqual(invalidTransferFailed, true, 'invalid transfer fails before changing balances');
assertClose(ledger.balance('bbva-ars'), balanceBeforeInvalidTransfer, 'failed transfer leaves origin unchanged');

const existingTransactions = [
  {
    id: 'manual-shoes',
    amount: 950,
    currency: 'EUR',
    description: 'Zapatillas personalizadas',
    merchantKey: 'my-mancini',
    category: 'Compras',
    subCategory: 'Ropa y calzado',
    accountId: 'bbva-visa',
    source: 'manual',
    date: '2026-05-03T12:00:00.000Z',
  },
  {
    id: 'existing-fingerprint',
    amount: 18_000,
    description: 'Uber',
    transactionFingerprint: 'uber-2026-06-01-18000',
    date: '2026-06-01T12:00:00.000Z',
  },
];

const exactDuplicate = findLikelyDuplicateMatch({
  amount: 18_000,
  description: 'UBER',
  transactionFingerprint: 'uber-2026-06-01-18000',
  date: '2026-06-01T12:00:00.000Z',
}, existingTransactions);
assertEqual(exactDuplicate?.duplicateOfId, 'existing-fingerprint', 'exact fingerprint detects duplicate');

const semanticDuplicate = findLikelyDuplicateMatch({
  amount: 1_020,
  currency: 'USD',
  description: 'MY MANCINI CALZADO',
  merchantKey: 'my-mancini',
  category: 'Compras',
  subCategory: 'Ropa y calzado',
  accountId: 'bbva-visa',
  date: '2026-05-20T12:00:00.000Z',
}, existingTransactions);
assertEqual(semanticDuplicate?.duplicateOfId, 'manual-shoes', 'semantic matching links foreign card purchase');
assertIncludes(semanticDuplicate?.reason || '', 'mismo gasto', 'semantic duplicate explains the suggestion');

const distinctPurchase = findLikelyDuplicateMatch({
  amount: 1_020,
  currency: 'USD',
  description: 'Hotel Roma',
  merchantKey: 'hotel-roma',
  category: 'Viajes',
  subCategory: 'Alojamiento',
  accountId: 'bbva-visa',
  date: '2026-05-20T12:00:00.000Z',
}, existingTransactions);
assertEqual(distinctPurchase, null, 'different purchase is not linked only because amount is similar');

const savingsAccountMatch = findBestAccountForImportedTransaction({
  importSource: 'bbva_caja_ahorro_ars',
  currency: 'ARS',
  fileName: '26-04-30_Caja-ARS.pdf',
  statementAccountLabel: 'Caja de ahorro ARS',
}, accounts);
assertEqual(savingsAccountMatch.account?.id, 'bbva-ars', 'savings statement maps to bank account');

const visaAccountMatch = findBestAccountForImportedTransaction({
  importSource: 'bbva_visa',
  currency: 'ARS',
  fileName: 'Visa-BBVA.pdf',
  statementAccountLabel: 'Visa',
}, accounts);
assertEqual(visaAccountMatch.account?.id, 'bbva-visa', 'Visa statement maps to Visa, not Mastercard');

console.log('Finance acceptance checks passed:');
console.log('- income, expense, edit and delete');
console.log('- internal and cross-currency transfers');
console.log('- credit-card purchase and payment');
console.log('- pending, repeated and invalid operations');
console.log('- exact and semantic duplicate detection');
console.log('- BBVA savings and Visa account matching');
