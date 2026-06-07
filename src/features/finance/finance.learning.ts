import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { buildFinanceLearningKey } from './finance.taxonomy';
import type { TransactionKind, NeutralType } from './finance.types';

export interface FinanceLearningMapping {
  id?: string;
  uid: string;
  householdId: string;
  originalDescription: string;
  mappedDescription: string;
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  kind?: TransactionKind;
  neutralType?: NeutralType;
  isFixed?: boolean;
  accountId?: string;
  sourceAccountId?: string;
  toAccountId?: string;
  paymentType?: string;
  beneficiaryType?: string;
  beneficiaryLabel?: string;
  scope?: string;
  visibility?: string;
  merchantName?: string;
  merchantKey?: string;
  transactionFingerprint?: string;
  learningKey?: string;
  useCount?: number;
  lastUsedAt?: Date;
}

export function subscribeToFinanceLearningMappings(
  householdId: string,
  onMappings: (mappings: FinanceLearningMapping[]) => void,
  onError?: (error: unknown) => void,
) {
  const mappingsQuery = query(collection(db, 'mappings'), where('householdId', '==', householdId));
  return onSnapshot(
    mappingsQuery,
    snapshot => onMappings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinanceLearningMapping))),
    onError,
  );
}

export async function upsertFinanceLearningMapping(input: Omit<FinanceLearningMapping, 'learningKey' | 'lastUsedAt'>, existingMappings: FinanceLearningMapping[] = []) {
  const originalDescription = input.originalDescription.trim();
  const mappedDescription = input.mappedDescription.trim();
  if (!originalDescription || !mappedDescription || !input.category) return;

  const learningKey = buildFinanceLearningKey(originalDescription || mappedDescription);
  const existingMapping = existingMappings.find(mapping => {
    if (input.merchantKey && mapping.merchantKey === input.merchantKey) return true;
    const mappingKey = mapping.learningKey || buildFinanceLearningKey(mapping.originalDescription || mapping.mappedDescription || '');
    return Boolean(learningKey && mappingKey && (learningKey.includes(mappingKey) || mappingKey.includes(learningKey)));
  });

  const patch = compactLearningPayload({
    mappedDescription,
    category: input.category,
    subCategory: input.subCategory || '',
    subSubCategory: input.subSubCategory || '',
    kind: input.kind || 'expense',
    neutralType: input.neutralType,
    isFixed: input.isFixed || false,
    accountId: input.accountId || '',
    sourceAccountId: input.sourceAccountId || input.accountId || '',
    toAccountId: input.toAccountId || '',
    paymentType: input.paymentType || '',
    beneficiaryType: input.beneficiaryType || undefined,
    beneficiaryLabel: input.beneficiaryLabel || '',
    scope: input.scope || undefined,
    visibility: input.visibility || undefined,
    merchantName: input.merchantName || '',
    merchantKey: input.merchantKey || '',
    transactionFingerprint: input.transactionFingerprint || '',
    learningKey,
    useCount: (existingMapping?.useCount || 0) + 1,
    lastUsedAt: new Date(),
  });

  if (existingMapping?.id) {
    await updateDoc(doc(db, 'mappings', existingMapping.id), patch);
    return;
  }

  await addDoc(collection(db, 'mappings'), {
    uid: input.uid,
    householdId: input.householdId,
    originalDescription,
    ...patch,
    createdAt: new Date(),
  });
}

function compactLearningPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<T>;
}
