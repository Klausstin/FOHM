import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type {
  CreateFinancialAccountInput,
  CreateFinancialTransactionInput,
  FinancialAccountRecord,
  FinancialTransactionRecord,
} from './finance.types';
import { getAccountBalanceDelta } from './finance.accounts.ts';

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
  await addDoc(collection(db, 'accounts'), {
    ...input,
    createdAt: new Date(),
  });
}

export async function updateFinancialAccount(accountId: string, input: Partial<CreateFinancialAccountInput>) {
  await updateDoc(doc(db, 'accounts', accountId), input);
}

export async function deleteFinancialAccount(accountId: string) {
  await deleteDoc(doc(db, 'accounts', accountId));
}

export async function createFinancialTransaction(input: CreateFinancialTransactionInput) {
  return addDoc(collection(db, 'finances'), {
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
    kind: input.kind || (input.type === 'income' ? 'income' : input.type === 'neutral' || input.type === 'transfer' ? 'neutral' : 'expense'),
    neutralType: input.neutralType || null,
    accountId: input.accountId || '',
    toAccountId: input.toAccountId || '',
    paymentMethodId: input.paymentMethodId || '',
    tags: input.tags || [],
    isFixed: Boolean(input.isFixed),
    date: input.date,
    source: input.source || 'manual',
    confidence: input.confidence || 'exact',
    status: input.status || 'posted',
    reconciliationBatchId: input.reconciliationBatchId || null,
    estimatedReason: input.estimatedReason || null,
    needsReview: Boolean(input.needsReview),
    isConfirmed: input.isConfirmed ?? true,
    generatedBy: input.generatedBy || input.uid,
    assignedTo: input.assignedTo || input.uid,
    payer: input.payer || '',
    paymentType: input.paymentType || '',
    paymentStatus: input.paymentStatus || 'Contabilizado',
    merchantName: input.merchantName || '',
    merchantKey: input.merchantKey || '',
    merchant: input.merchant || input.merchantName || '',
    owner: input.owner || '',
    projectId: input.projectId || '',
    isReimbursable: Boolean(input.isReimbursable),
    reimbursementStatus: input.reimbursementStatus || 'not_applicable',
    importSource: input.importSource || '',
    transactionFingerprint: input.transactionFingerprint || '',
    statementFingerprint: input.statementFingerprint || '',
    duplicateOfId: input.duplicateOfId || '',
    duplicateReason: input.duplicateReason || '',
    accountBalanceApplied: Boolean(input.accountBalanceApplied),
    createdAt: new Date(),
  });
}

export async function updateFinancialTransaction(transactionId: string, input: Partial<CreateFinancialTransactionInput>) {
  await updateDoc(doc(db, 'finances', transactionId), {
    ...input,
    updatedAt: new Date(),
  });
}

export async function deleteFinancialTransaction(transactionId: string) {
  await deleteDoc(doc(db, 'finances', transactionId));
}

export async function applyTransactionToAccountBalances(input: CreateFinancialTransactionInput) {
  if (input.accountId) {
    const accountRef = doc(db, 'accounts', input.accountId);
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      const currentBalance = accountSnap.data().balance || 0;
      const newBalance = currentBalance + getAccountBalanceDelta({
        accountType: accountSnap.data().type,
        transactionType: input.type,
        amount: input.amount,
        direction: 'source',
      });
      await updateDoc(accountRef, { balance: newBalance });
    }
  }

  if (input.type === 'transfer' && input.toAccountId) {
    const toAccountRef = doc(db, 'accounts', input.toAccountId);
    const toAccountSnap = await getDoc(toAccountRef);
    if (toAccountSnap.exists()) {
      const currentBalance = toAccountSnap.data().balance || 0;
      const newBalance = currentBalance + getAccountBalanceDelta({
        accountType: toAccountSnap.data().type,
        transactionType: input.type,
        amount: input.amount,
        direction: 'destination',
      });
      await updateDoc(toAccountRef, { balance: newBalance });
    }
  }
}
