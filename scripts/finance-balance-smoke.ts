import { getAccountBalanceDelta } from '../src/features/finance/finance.accounts.ts';
import {
  calculateBalanceTransitionDeltas,
  calculateTransactionBalanceDeltas,
  getBalanceTransactionType,
  getSourceAccountId,
  shouldApplyTransactionToAccountBalances,
  type BalanceAffectingTransactionInput,
} from '../src/features/finance/finance.balance.ts';

type SmokeAccount = {
  id: string;
  type: string;
  balance: number;
};

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function applyToAccounts(accounts: SmokeAccount[], transaction: BalanceAffectingTransactionInput, multiplier = 1) {
  if (!shouldApplyTransactionToAccountBalances(transaction)) return false;

  const sourceAccountId = getSourceAccountId(transaction);
  const transactionType = getBalanceTransactionType(transaction);
  let touched = false;

  const source = accounts.find(account => account.id === sourceAccountId);
  if (source) {
    source.balance += getAccountBalanceDelta({
      accountType: source.type,
      transactionType,
      amount: Number(transaction.amount || 0),
      direction: 'source',
    }) * multiplier;
    touched = true;
  }

  if (transactionType === 'transfer' && transaction.toAccountId) {
    const destination = accounts.find(account => account.id === transaction.toAccountId);
    if (destination) {
      destination.balance += getAccountBalanceDelta({
        accountType: destination.type,
        transactionType,
        amount: Number(transaction.amount || 0),
        direction: 'destination',
      }) * multiplier;
      touched = true;
    }
  }

  return touched;
}

const accounts: SmokeAccount[] = [
  { id: 'cash-ars', type: 'cash', balance: 50000 },
  { id: 'bank-ars', type: 'bank', balance: 100000 },
  { id: 'visa', type: 'credit_card', balance: 0 },
];

const cashExpense: BalanceAffectingTransactionInput = {
  amount: 18000,
  type: 'expense',
  accountId: 'cash-ars',
  sourceAccountId: 'cash-ars',
  status: 'posted',
};

assertEqual(applyToAccounts(accounts, cashExpense), true, 'posted expense should apply');
assertEqual(accounts.find(account => account.id === 'cash-ars')?.balance, 32000, 'cash expense decreases cash');

applyToAccounts(accounts, { ...cashExpense, accountBalanceApplied: true }, -1);
assertEqual(accounts.find(account => account.id === 'cash-ars')?.balance, 50000, 'reversing old expense restores cash');

const editedCashExpense = { ...cashExpense, amount: 20000 };
applyToAccounts(accounts, editedCashExpense);
assertEqual(accounts.find(account => account.id === 'cash-ars')?.balance, 30000, 'edited expense applies new amount');

applyToAccounts(accounts, { ...editedCashExpense, accountBalanceApplied: true }, -1);
assertEqual(accounts.find(account => account.id === 'cash-ars')?.balance, 50000, 'deleting edited expense restores cash');

const cardExpense: BalanceAffectingTransactionInput = {
  amount: 950,
  type: 'expense',
  accountId: 'visa',
  sourceAccountId: 'visa',
  status: 'posted',
};
applyToAccounts(accounts, cardExpense);
assertEqual(accounts.find(account => account.id === 'visa')?.balance, -950, 'credit-card expense creates debt');

const cardPayment: BalanceAffectingTransactionInput = {
  amount: 950,
  type: 'transfer',
  neutralType: 'credit_card_payment',
  accountId: 'bank-ars',
  sourceAccountId: 'bank-ars',
  toAccountId: 'visa',
  status: 'posted',
};
applyToAccounts(accounts, cardPayment);
assertEqual(accounts.find(account => account.id === 'bank-ars')?.balance, 99050, 'card payment decreases bank');
assertEqual(accounts.find(account => account.id === 'visa')?.balance, 0, 'card payment cancels card debt');

assertEqual(shouldApplyTransactionToAccountBalances({ ...cashExpense, status: 'pending' }), false, 'pending movement should not apply');
assertEqual(shouldApplyTransactionToAccountBalances({ ...cashExpense, status: 'needs_review' }), false, 'review movement should not apply by default');
assertEqual(
  shouldApplyTransactionToAccountBalances({ ...cashExpense, status: 'needs_review', source: 'catchup_estimate' }),
  true,
  'intentional catchup estimate should apply',
);

const accountTypes = {
  'cash-ars': 'cash',
  'bank-ars': 'bank',
  'bank-usd': 'bank',
  visa: 'credit_card',
};

const createExpenseDeltas = calculateTransactionBalanceDeltas(cashExpense, accountTypes);
assertEqual(createExpenseDeltas['cash-ars'], -18000, 'atomic create calculates one cash impact');

const editExpenseDeltas = calculateBalanceTransitionDeltas(
  { ...cashExpense, accountBalanceApplied: true },
  editedCashExpense,
  accountTypes,
);
assertEqual(editExpenseDeltas['cash-ars'], -2000, 'atomic edit only applies the difference');

const repeatedConfirmationDeltas = calculateBalanceTransitionDeltas(
  { ...editedCashExpense, accountBalanceApplied: true },
  editedCashExpense,
  accountTypes,
);
assertEqual(repeatedConfirmationDeltas['cash-ars'], 0, 'confirming twice does not duplicate the balance impact');

const deleteExpenseDeltas = calculateBalanceTransitionDeltas(
  { ...editedCashExpense, accountBalanceApplied: true },
  null,
  accountTypes,
);
assertEqual(deleteExpenseDeltas['cash-ars'], 20000, 'atomic delete restores the previous impact');

const currencyExchangeTransfer: BalanceAffectingTransactionInput = {
  amount: 1000,
  settlementAmount: 1440000,
  type: 'transfer',
  accountId: 'bank-usd',
  sourceAccountId: 'bank-usd',
  toAccountId: 'bank-ars',
  status: 'posted',
};
const exchangeDeltas = calculateTransactionBalanceDeltas(currencyExchangeTransfer, accountTypes);
assertEqual(exchangeDeltas['bank-usd'], -1000, 'cross-currency transfer uses source amount');
assertEqual(exchangeDeltas['bank-ars'], 1440000, 'cross-currency transfer uses destination amount');

const atomicCardPaymentDeltas = calculateTransactionBalanceDeltas(cardPayment, accountTypes);
assertEqual(atomicCardPaymentDeltas['bank-ars'], -950, 'atomic card payment decreases bank balance');
assertEqual(atomicCardPaymentDeltas.visa, 950, 'atomic card payment reduces credit-card debt');

console.log('Finance balance smoke checks passed.');
