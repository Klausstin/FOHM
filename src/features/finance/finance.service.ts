import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import type {
  CreateFinancialAccountInput,
  CreateFinancialTransactionInput,
  FinancialAccountRecord,
  FinancialTransactionRecord,
} from './finance.types';
import {
  calculateTransactionBalanceDeltas,
  calculateBalanceTransitionDeltas,
  getBalanceAccountIds,
  shouldApplyTransactionToAccountBalances,
  type BalanceAffectingTransactionInput,
} from './finance.balance.ts';

export { shouldApplyTransactionToAccountBalances } from './finance.balance.ts';

export function subscribeToHouseholdFinancialTransactions(
  householdId: string,
  onTransactions: (transactions: FinancialTransactionRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  const financeQuery = query(
    collection(db, 'finances'),
    where('householdId', '==', householdId),
    orderBy('date', 'desc'),
  );

  return onSnapshot(
    financeQuery,
    snapshot => onTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransactionRecord))),
    onError,
  );
}

export function subscribeToHouseholdFinancialAccounts(
  householdId: string,
  onAccounts: (accounts: FinancialAccountRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  const accountsQuery = query(collection(db, 'accounts'), where('householdId', '==', householdId));
  return onSnapshot(
    accountsQuery,
    snapshot => onAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialAccountRecord))),
    onError,
  );
}

export async function createFinancialAccount(input: CreateFinancialAccountInput) {
  await addDoc(collection(db, 'accounts'), compactPayload({
    ...input,
    createdAt: new Date(),
  }));
}

export async function updateFinancialAccount(accountId: string, input: Partial<CreateFinancialAccountInput>) {
  await updateDoc(doc(db, 'accounts', accountId), compactAccountUpdatePayload(input));
}

export async function deleteFinancialAccount(accountId: string) {
  await deleteDoc(doc(db, 'accounts', accountId));
}

export async function createFinancialTransaction(input: CreateFinancialTransactionInput) {
  // Los movimientos que afectan saldos deben usar createFinancialTransactionAtomically.
  const payload = buildFinancialTransactionPayload(input);

  try {
    return await addDoc(collection(db, 'finances'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'finances');
    throw error;
  }
}

function buildFinancialTransactionPayload(input: CreateFinancialTransactionInput) {
  const kind = input.kind || (input.type === 'income' ? 'income' : input.type === 'neutral' || input.type === 'transfer' ? 'neutral' : 'expense');
  return compactPayload({
    uid: input.uid,
    householdId: input.householdId,
    amount: input.amount,
    currency: input.currency,
    description: input.description || '',
    note: input.note || '',
    category: input.category,
    subCategory: input.subCategory || '',
    subSubCategory: input.subSubCategory || '',
    type: input.type,
    kind: kind === input.type ? undefined : kind,
    neutralType: input.neutralType || undefined,
    accountId: input.accountId || '',
    sourceAccountId: input.sourceAccountId || input.accountId || '',
    toAccountId: input.toAccountId || '',
    paymentMethodId: input.paymentMethodId || '',
    tags: input.tags || [],
    isFixed: input.isFixed ? true : undefined,
    date: input.date,
    source: input.source || 'manual',
    confidence: input.confidence && input.confidence !== 'exact' ? input.confidence : undefined,
    status: input.status && input.status !== 'posted' ? input.status : undefined,
    reconciliationBatchId: input.reconciliationBatchId || undefined,
    estimatedReason: input.estimatedReason || undefined,
    needsReview: input.needsReview ? true : undefined,
    isConfirmed: input.isConfirmed ?? true,
    createdByUserId: input.createdByUserId || input.generatedBy || input.uid,
    generatedBy: input.generatedBy && input.generatedBy !== input.uid ? input.generatedBy : undefined,
    executedByUserId: input.executedByUserId || undefined,
    executedByLabel: input.executedByLabel || undefined,
    assignedTo: input.assignedTo && input.assignedTo !== input.uid ? input.assignedTo : undefined,
    payer: input.payer || '',
    beneficiaryType: input.beneficiaryType || 'household',
    beneficiaryId: input.beneficiaryId || undefined,
    beneficiaryLabel: input.beneficiaryLabel || 'Hogar',
    scope: input.scope || 'familia',
    visibility: input.visibility || 'household_shared',
    paymentType: input.paymentType || '',
    paymentStatus: input.paymentStatus && input.paymentStatus !== 'Contabilizado' ? input.paymentStatus : undefined,
    merchantName: input.merchantName || '',
    merchantKey: input.merchantKey || '',
    merchant: input.merchant || input.merchantName || '',
    owner: input.owner || '',
    projectId: input.projectId || '',
    travelTripId: input.travelTripId || '',
    travelTripName: input.travelTripName || '',
    travelTripSuggestion: input.travelTripSuggestion || '',
    travelCategory: input.travelCategory || '',
    originalAmount: input.originalAmount,
    originalCurrency: input.originalCurrency || '',
    settlementAmount: input.settlementAmount,
    settlementCurrency: input.settlementCurrency || '',
    fxRate: input.fxRate,
    isReimbursable: Boolean(input.isReimbursable),
    reimbursementStatus: input.reimbursementStatus || 'not_applicable',
    importSource: input.importSource || '',
    transactionFingerprint: input.transactionFingerprint || '',
    statementFingerprint: input.statementFingerprint || '',
    duplicateOfId: input.duplicateOfId || '',
    duplicateReason: input.duplicateReason || '',
    accountBalanceApplied: input.accountBalanceApplied ? true : undefined,
    createdAt: new Date(),
  });
}

function compactPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  ) as Partial<T>;
}

function compactUpdatePayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function compactAccountUpdatePayload(input: Partial<CreateFinancialAccountInput>) {
  const payload = compactPayload(input as Record<string, unknown>);
  const clearableFields = [
    'institution',
    'accountNumberLast4',
    'statementLabel',
    'alias',
    'closingDay',
    'dueDay',
    'creditLimit',
    'notes',
  ];

  clearableFields.forEach(field => {
    if (field in input && input[field as keyof CreateFinancialAccountInput] === null) {
      payload[field] = null;
    }
  });

  return payload;
}

export async function updateFinancialTransaction(transactionId: string, input: Partial<CreateFinancialTransactionInput>) {
  await updateDoc(doc(db, 'finances', transactionId), compactUpdatePayload({
    ...input,
    updatedAt: new Date(),
  }));
}

type AtomicBalanceOptions = {
  applyBalances?: boolean;
};

async function readAtomicAccounts(
  firestoreTransaction: Parameters<Parameters<typeof runTransaction>[1]>[0],
  inputs: BalanceAffectingTransactionInput[],
) {
  const accountIds = Array.from(new Set(inputs.flatMap(getBalanceAccountIds)));
  const accounts = new Map<string, { ref: ReturnType<typeof doc>; balance: number; type: string }>();

  for (const accountId of accountIds) {
    const accountRef = doc(db, 'accounts', accountId);
    const accountSnapshot = await firestoreTransaction.get(accountRef);
    if (!accountSnapshot.exists()) {
      throw new Error(`No existe la cuenta necesaria para actualizar el saldo: ${accountId}.`);
    }
    accounts.set(accountId, {
      ref: accountRef,
      balance: Number(accountSnapshot.data().balance || 0),
      type: String(accountSnapshot.data().type || 'bank'),
    });
  }

  return accounts;
}

function applyAtomicBalanceDeltas(
  firestoreTransaction: Parameters<Parameters<typeof runTransaction>[1]>[0],
  accounts: Map<string, { ref: ReturnType<typeof doc>; balance: number; type: string }>,
  deltas: Record<string, number>,
) {
  Object.entries(deltas).forEach(([accountId, delta]) => {
    const account = accounts.get(accountId);
    if (!account) throw new Error(`No se pudo actualizar la cuenta ${accountId}.`);
    firestoreTransaction.update(account.ref, { balance: account.balance + delta });
  });
}

export async function createFinancialTransactionAtomically(
  input: CreateFinancialTransactionInput,
  options: AtomicBalanceOptions = {},
) {
  const financeRef = doc(collection(db, 'finances'));

  try {
    await runTransaction(db, async firestoreTransaction => {
      const shouldApplyBalance = options.applyBalances !== false && shouldApplyTransactionToAccountBalances(input);
      const balanceInput = shouldApplyBalance ? input : null;
      const accounts = await readAtomicAccounts(firestoreTransaction, balanceInput ? [balanceInput] : []);
      const accountTypes = Object.fromEntries(Array.from(accounts, ([id, account]) => [id, account.type]));
      const deltas = balanceInput ? calculateTransactionBalanceDeltas(balanceInput, accountTypes) : {};

      applyAtomicBalanceDeltas(firestoreTransaction, accounts, deltas);
      firestoreTransaction.set(financeRef, buildFinancialTransactionPayload({
        ...input,
        accountBalanceApplied: shouldApplyBalance,
      }));
    });
    return financeRef;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'finances');
    throw error;
  }
}

export async function updateFinancialTransactionAtomically(
  transactionId: string,
  input: Partial<CreateFinancialTransactionInput>,
  options: AtomicBalanceOptions = {},
) {
  const financeRef = doc(db, 'finances', transactionId);

  try {
    return await runTransaction(db, async firestoreTransaction => {
      const financeSnapshot = await firestoreTransaction.get(financeRef);
      if (!financeSnapshot.exists()) throw new Error('El movimiento que queres editar ya no existe.');

      const previous = financeSnapshot.data() as BalanceAffectingTransactionInput;
      const next = { ...previous, ...input } as BalanceAffectingTransactionInput;
      const previousApplied = Boolean(previous.accountBalanceApplied);
      const shouldApplyNext = options.applyBalances !== false && shouldApplyTransactionToAccountBalances(next);
      const balanceInputs = [
        ...(previousApplied ? [previous] : []),
        ...(shouldApplyNext ? [next] : []),
      ];
      const accounts = await readAtomicAccounts(firestoreTransaction, balanceInputs);
      const accountTypes = Object.fromEntries(Array.from(accounts, ([id, account]) => [id, account.type]));
      const deltas = calculateBalanceTransitionDeltas(previous, next, accountTypes, shouldApplyNext);

      applyAtomicBalanceDeltas(firestoreTransaction, accounts, deltas);
      firestoreTransaction.update(financeRef, compactUpdatePayload({
        ...input,
        accountBalanceApplied: shouldApplyNext,
        updatedAt: new Date(),
      }));

      return { balanceApplied: shouldApplyNext };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `finances/${transactionId}`);
    throw error;
  }
}

export async function deleteFinancialTransactionAtomically(transactionId: string) {
  const financeRef = doc(db, 'finances', transactionId);

  try {
    await runTransaction(db, async firestoreTransaction => {
      const financeSnapshot = await firestoreTransaction.get(financeRef);
      if (!financeSnapshot.exists()) return;

      const previous = financeSnapshot.data() as BalanceAffectingTransactionInput;
      const previousApplied = Boolean(previous.accountBalanceApplied);
      const accounts = await readAtomicAccounts(firestoreTransaction, previousApplied ? [previous] : []);
      const accountTypes = Object.fromEntries(Array.from(accounts, ([id, account]) => [id, account.type]));
      const deltas = previousApplied ? calculateTransactionBalanceDeltas(previous, accountTypes, -1) : {};

      applyAtomicBalanceDeltas(firestoreTransaction, accounts, deltas);
      firestoreTransaction.delete(financeRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `finances/${transactionId}`);
    throw error;
  }
}
