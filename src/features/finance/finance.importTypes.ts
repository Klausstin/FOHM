// Tipos compartidos del flujo de importación y movimientos pendientes de finanzas.
// Extraídos de FinanceTracker.tsx (Fase A del refactor) para que la lógica y los
// componentes puedan reutilizarlos sin depender del componente gigante.

export interface DuplicateMatch {
  reason: string;
  duplicateOfId?: string;
}

export interface ParsedFinanceTrace {
  originalConcept?: string;
  transferDetail?: string;
  counterpartyName?: string;
  counterpartyAlias?: string;
  counterpartyAccount?: string;
  importedFile?: string;
  installmentLabel?: string;
  cardLast4?: string;
  voucherNumber?: string;
  debitCardDetailLine?: string;
  sourceLine?: string;
  reconciliations: string[];
  otherLines: string[];
}

export interface PendingTransaction {
  id: string;
  amount: number;
  currency?: string;
  description: string;
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  type: string;
  accountId?: string;
  accountName?: string;
  sourceAccountId?: string;
  toAccountId?: string;
  date: string;
  isFixed: boolean;
  originalDescription: string;
  fileName: string;
  confidence: number;
  needsReview: boolean;
  merchantName?: string;
  merchantKey?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  counterpartyAlias?: string;
  transferDetail?: string;
  importSource?: string;
  importMode?: string;
  sourceAccountLabel?: string;
  sourceCategoryLabel?: string;
  statementAccountLabel?: string;
  tags?: string[];
  paymentType?: string;
  sourceLine?: string;
  debitCardDetailLine?: string;
  cardLast4?: string;
  voucherNumber?: string;
  installmentNumber?: number;
  installmentTotal?: number;
  installmentLabel?: string;
  accountMatchConfidence?: string;
  accountMatchReason?: string;
  transactionFingerprint?: string;
  statementFingerprint?: string;
  duplicateOfId?: string;
  duplicateReason?: string;
}

export interface WalletMemoryMappingImport {
  originalDescription: string;
  mappedDescription: string;
  category: string;
  subCategory?: string;
  kind?: string;
  merchantName?: string;
  merchantKey?: string;
  useCount?: number;
  confidence?: number;
}

export interface StatementClosingSuggestion {
  id: string;
  accountId: string;
  accountName: string;
  currency: string;
  fileName: string;
  periodEnd?: string;
  closingBalance: number;
  targetBalance: number;
  statementLabel?: string;
}

export interface PendingImportGroup {
  key: string;
  kind: 'duplicate' | 'missing_account' | 'mixed_review';
  title: string;
  detail: string;
  count: number;
  totalAmount: number;
  currency: string;
  category: string;
  subCategory?: string;
  type: string;
  transactionIds: string[];
  sample: PendingTransaction;
  canBulkConfirm: boolean;
}
