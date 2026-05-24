export type FinanceCurrency = 'ARS' | 'USD' | 'EUR' | 'BRL' | 'CLP' | 'UYU';

export type TransactionKind = 'expense' | 'income' | 'neutral';

export type NeutralType =
  | 'internal_transfer'
  | 'credit_card_payment'
  | 'currency_exchange'
  | 'investment_movement'
  | 'loan_movement'
  | 'balance_adjustment';

export type FinanceTransactionType = TransactionKind | 'transfer';

export type FinanceSource =
  | 'manual'
  | 'pdf'
  | 'csv'
  | 'catchup_estimate'
  | 'catchup_inferred';

export type FinanceConfidence = 'exact' | 'estimated' | 'inferred';

export type FinanceStatus = 'pending' | 'posted' | 'ignored' | 'needs_review';

export interface FinancialAccountRecord {
  id: string;
  uid: string;
  householdId: string;
  name: string;
  currency: FinanceCurrency | string;
  balance: number;
  color?: string;
  type?: 'bank' | 'wallet' | 'investment' | 'credit_card' | 'cash' | string;
  lastReconciledAt?: any;
  createdAt?: any;
}

export interface FinancialTransactionRecord {
  id: string;
  uid: string;
  householdId: string;
  amount: number;
  currency?: FinanceCurrency | string;
  description?: string;
  note?: string;
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  type: FinanceTransactionType;
  kind?: TransactionKind;
  neutralType?: NeutralType;
  accountId?: string;
  toAccountId?: string;
  paymentMethodId?: string;
  tags?: string[];
  date: any;
  source: FinanceSource;
  confidence?: FinanceConfidence;
  status?: FinanceStatus;
  reconciliationBatchId?: string | null;
  estimatedReason?: string | null;
  needsReview?: boolean;
  pdfName?: string;
  isFixed?: boolean;
  isConfirmed?: boolean;
  generatedBy?: string;
  assignedTo?: string;
  payer?: string;
  paymentType?: string;
  paymentStatus?: string;
  merchantName?: string;
  merchantKey?: string;
  merchant?: string;
  owner?: 'agustin' | 'vicky' | 'shared' | 'other' | string;
  projectId?: string;
  isReimbursable?: boolean;
  reimbursementStatus?: 'pending' | 'reimbursed' | 'not_applicable' | string;
  importSource?: string;
  transactionFingerprint?: string;
  statementFingerprint?: string;
  duplicateOfId?: string;
  duplicateReason?: string;
  accountBalanceApplied?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface CreateFinancialAccountInput {
  uid: string;
  householdId: string;
  name: string;
  currency: string;
  balance: number;
  color?: string;
  type?: string;
}

export interface CreateFinancialTransactionInput {
  uid: string;
  householdId: string;
  amount: number;
  currency: string;
  description?: string;
  note?: string;
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  type: FinanceTransactionType | string;
  kind?: TransactionKind;
  neutralType?: NeutralType;
  accountId?: string;
  toAccountId?: string;
  paymentMethodId?: string;
  tags?: string[];
  date: Date;
  source?: FinanceSource;
  confidence?: FinanceConfidence;
  status?: FinanceStatus;
  reconciliationBatchId?: string | null;
  estimatedReason?: string | null;
  needsReview?: boolean;
  isFixed?: boolean;
  isConfirmed?: boolean;
  generatedBy?: string;
  assignedTo?: string;
  payer?: string;
  paymentType?: string;
  paymentStatus?: string;
  merchantName?: string;
  merchantKey?: string;
  merchant?: string;
  owner?: 'agustin' | 'vicky' | 'shared' | 'other' | string;
  projectId?: string;
  isReimbursable?: boolean;
  reimbursementStatus?: 'pending' | 'reimbursed' | 'not_applicable' | string;
  importSource?: string;
  transactionFingerprint?: string;
  statementFingerprint?: string;
  duplicateOfId?: string;
  duplicateReason?: string;
  accountBalanceApplied?: boolean;
}

export interface CatchupDraftInput {
  uid: string;
  householdId: string;
  accountId?: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  date: Date;
  estimatedReason: string;
  reconciliationBatchId: string;
}
