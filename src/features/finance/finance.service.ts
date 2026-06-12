import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import type {
  CreateFinancialAccountInput,
  CreateFinancialTransactionInput,
  FinancialAccountRecord,
  FinancialTransactionRecord,
} from './finance.types';
import { getAccountBalanceDelta } from './finance.accounts.ts';
import {
  getBalanceTransactionType,
  getSourceAccountId,
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
  const kind = input.kind || (input.type === 'income' ? 'income' : input.type === 'neutral' || input.type === 'transfer' ? 'neutral' : 'expense');
  const payload = compactPayload({
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

  try {
    return await addDoc(collection(db, 'finances'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'finances');
    throw error;
  }
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

export async function deleteFinancialTransaction(transactionId: string) {
  await deleteDoc(doc(db, 'finances', transactionId));
}

async function adjustAccountBalance(accountId: string, input: BalanceAffectingTransactionInput, direction: 'source' | 'destination', multiplier = 1) {
  const accountRef = doc(db, 'accounts', accountId);
  const accountSnap = await getDoc(accountRef);
  if (!accountSnap.exists()) return false;

  const currentBalance = Number(accountSnap.data().balance || 0);
  const transactionType = getBalanceTransactionType(input);
  const delta = getAccountBalanceDelta({
    accountType: accountSnap.data().type,
    transactionType,
    amount: Number(input.amount || 0),
    direction,
  });

  await updateDoc(accountRef, { balance: currentBalance + delta * multiplier });
  return true;
}

async function applyTransactionBalanceDelta(input: BalanceAffectingTransactionInput, multiplier = 1) {
  if (!shouldApplyTransactionToAccountBalances(input)) return false;

  const sourceAccountId = getSourceAccountId(input);
  let touchedAnyAccount = false;

  if (sourceAccountId) {
    touchedAnyAccount = await adjustAccountBalance(sourceAccountId, input, 'source', multiplier) || touchedAnyAccount;
  }

  if (input.type === 'transfer' && input.toAccountId) {
    touchedAnyAccount = await adjustAccountBalance(input.toAccountId, input, 'destination', multiplier) || touchedAnyAccount;
  }

  return touchedAnyAccount;
}

export async function applyTransactionToAccountBalances(input: BalanceAffectingTransactionInput) {
  return applyTransactionBalanceDelta(input, 1);
}

export async function reverseTransactionFromAccountBalances(input: BalanceAffectingTransactionInput) {
  if (!input.accountBalanceApplied) return false;
  return applyTransactionBalanceDelta(input, -1);
}
