// Helpers del flujo de importación y revisión de movimientos pendientes: asignar
// cuentas sugeridas, detectar duplicados/CSV/wallet, agrupar para revisión y
// aplicar la memoria aprendida. Extraído de FinanceTracker.tsx (Fase A).
import { findBestAccountForImportedTransaction } from './finance.accounts';
import { normalizeDuplicateText } from './finance.duplicates';
import { parseFinanceDateValue } from './finance.format';
import { buildFinanceLearningKey } from './finance.taxonomy';
import type { PendingTransaction, PendingImportGroup, StatementClosingSuggestion } from './finance.importTypes';

export function enrichImportedTransactionWithAccounts(transaction: any, accounts: any[]) {
  const sourceMatch = findBestAccountForImportedTransaction(transaction, accounts);
  const accountId = transaction.accountId || sourceMatch.account?.id || findSuggestedSourceAccount(transaction, accounts);
  const toAccountId = transaction.toAccountId || findSuggestedDestinationAccount(transaction, accounts);
  const needsAccountReview = transaction.type === 'transfer' ? !accountId || !toAccountId : !accountId;

  return {
    ...transaction,
    accountId,
    toAccountId,
    accountMatchConfidence: sourceMatch.confidence,
    accountMatchReason: sourceMatch.reason,
    needsReview: Boolean(transaction.needsReview || needsAccountReview || sourceMatch.confidence === 'low'),
  };
}

export function buildStatementClosingSuggestion(
  statement: any,
  transactions: any[],
  fileName: string,
  accounts: any[],
): StatementClosingSuggestion | null {
  if (!statement || typeof statement.closingBalance !== 'number') return null;

  const accountId = transactions.find(transaction => transaction.accountId)?.accountId;
  if (!accountId) return null;

  const account = accounts.find(item => item.id === accountId);
  if (!account) return null;

  const closingBalance = Number(statement.closingBalance || 0);
  const targetBalance = account.type === 'credit_card' ? -Math.abs(closingBalance) : closingBalance;

  return {
    id: `${fileName}:${statement.statementFingerprint || statement.periodEnd || closingBalance}`,
    accountId,
    accountName: account.name,
    currency: statement.currency || account.currency || 'ARS',
    fileName,
    periodEnd: statement.periodEnd,
    closingBalance,
    targetBalance,
    statementLabel: statement.accountLabel,
  };
}

export function findSuggestedSourceAccount(transaction: any, accounts: any[]) {
  if (transaction.importSource === 'bbva_visa') return findVisaCreditCardAccount(accounts)?.id || '';
  if (transaction.importSource === 'bbva_caja_ahorro_ars') return findCajaAhorroAccount(accounts)?.id || '';
  return '';
}

export function findSuggestedDestinationAccount(transaction: any, accounts: any[]) {
  const text = normalizeDuplicateText([
    transaction.description,
    transaction.originalDescription,
    transaction.subCategory,
    transaction.sourceLine,
    transaction.transferDetail,
    transaction.note,
  ].filter(Boolean).join(' '));
  if (transaction.type === 'transfer' && (text.includes('visa') || text.includes('master') || text.includes('mastercard') || text.includes('mc'))) {
    return findCreditCardAccountByText(accounts, text)?.id || '';
  }
  return '';
}

export function findVisaCreditCardAccount(accounts: any[]) {
  return findCreditCardAccountByText(accounts, 'visa');
}

export function findCreditCardAccountByText(accounts: any[], sourceText: string) {
  const wantsVisa = sourceText.includes('visa');
  const wantsMastercard = sourceText.includes('mastercard') || sourceText.includes('master') || sourceText.includes('mc');

  const exactMatch = accounts.find(account => {
    const text = normalizeDuplicateText(`${account.name || ''} ${account.type || ''} ${account.institution || ''} ${account.statementLabel || ''} ${account.accountNumberLast4 || ''} ${account.alias || ''}`);
    if (account.type !== 'credit_card') return false;
    if (wantsVisa) return text.includes('visa');
    if (wantsMastercard) return text.includes('mastercard') || text.includes('master') || text.includes('mc');
    return false;
  });

  if (exactMatch) return exactMatch;
  return wantsVisa || wantsMastercard ? undefined : accounts.find(account => account.type === 'credit_card');
}

export function findCajaAhorroAccount(accounts: any[]) {
  const assetAccounts = accounts.filter(account => account.type !== 'credit_card');
  return assetAccounts.find(account => {
    const text = normalizeDuplicateText(`${account.name || ''} ${account.type || ''} ${account.currency || ''} ${account.institution || ''} ${account.statementLabel || ''} ${account.alias || ''} ${account.accountNumberLast4 || ''}`);
    return account.currency === 'ARS' && (text.includes('caja') || text.includes('ahorro') || text.includes('cuenta sueldo') || text.includes('bbva'));
  }) || assetAccounts.find(account => account.currency === 'ARS' && account.type === 'bank');
}

export function pendingTransactionNeedsAccount(pt: Partial<PendingTransaction>) {
  if (isWalletHistoryPendingTransaction(pt)) return false;
  if (pt.type === 'transfer') return !pt.accountId || !pt.toAccountId;
  return !pt.accountId;
}

export function canConfirmPendingTransaction(pt: PendingTransaction) {
  return !pt.duplicateReason && !pendingTransactionNeedsAccount(pt);
}

export function getPendingCategoryType(category: string) {
  const normalizedCategory = normalizeDuplicateText(category || '');
  if (normalizedCategory.includes('ingreso')) return 'income';
  if (normalizedCategory.includes('transferencia') || normalizedCategory.includes('finanza')) return 'transfer';
  return 'expense';
}

export function formatPendingDate(value: any) {
  const date = parseFinanceDateValue(value);
  return !date || Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-AR');
}

export function isCsvFile(file: File) {
  return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
}

export function isCsvPendingTransaction(transaction: Partial<PendingTransaction>) {
  return transaction.importSource === 'generic_csv' || transaction.fileName?.toLowerCase().endsWith('.csv');
}

export function isWalletHistoryPendingTransaction(transaction: Partial<PendingTransaction>) {
  return transaction.importSource === 'wallet_history' || transaction.importMode === 'historical_learning';
}

export function shortFingerprint(value?: string) {
  if (!value) return '';
  return value.length > 18 ? `${value.slice(0, 18)}...` : value;
}

export function getPendingImportNextStep(summary: {
  readyCount: number;
  duplicateCount: number;
  missingAccountCount: number;
  cardPaymentCount: number;
  walletHistoryCount?: number;
}) {
  if (summary.walletHistoryCount && summary.walletHistoryCount > 0) {
    return 'Detecte historial de Wallet. Sirve para aprendizaje y analisis historico: al guardarlo conserva el rastro original, pero no toca saldos reales.';
  }
  if (summary.duplicateCount > 0) {
    return 'Primero resolvemos duplicados: vinculalos si son el mismo gasto que ya cargaste, descartalos si el resumen ya estaba importado, o guardalos igual solo si fueron compras realmente separadas.';
  }
  if (summary.missingAccountCount > 0) {
    return 'Despues asignamos cuenta: elegi de donde salio cada grupo. Si es pago de tarjeta, VEO necesita origen y destino para no contarlo como gasto doble.';
  }
  if (summary.readyCount > 0) {
    return `Hay ${summary.readyCount} movimiento(s) listos. Podes guardarlos juntos y corregir categorias despues si hace falta; VEO aprende de esas correcciones.`;
  }
  if (summary.cardPaymentCount > 0) {
    return 'Los pagos de tarjeta se tratan como transferencias entre cuentas: sirven para saldos, pero no duplican los consumos.';
  }
  return 'No queda ninguna accion clara pendiente. Si algo no corresponde, limpialo y volve a importar.';
}

export function applyLearnedFinanceMapping(transaction: any, mappings: any[]) {
  const originalText = normalizeDuplicateText(transaction.originalDescription || transaction.description || '');
  const learningKey = buildFinanceLearningKey(transaction.originalDescription || transaction.description || '');
  const merchantKey = transaction.merchantKey || '';
  const learnedMapping = mappings
    .filter(mapping => !mapping.isArchived)
    .map(mapping => {
    const mappingText = normalizeDuplicateText(mapping.originalDescription || '');
      const mappingLearningKey = mapping.learningKey || buildFinanceLearningKey(mapping.originalDescription || mapping.mappedDescription || '');
      const merchantMatch = merchantKey && mapping.merchantKey === merchantKey;
      const exactTextMatch = mappingText && mappingText === originalText;
      const learningMatch = learningKey && mappingLearningKey && (learningKey.includes(mappingLearningKey) || mappingLearningKey.includes(learningKey));
      return {
        mapping,
        score: merchantMatch ? 3 : exactTextMatch ? 2 : learningMatch ? 1 : 0,
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.mapping;

  if (!learnedMapping) return transaction;

  return {
    ...transaction,
    description: learnedMapping.mappedDescription || transaction.description,
    category: learnedMapping.category || transaction.category,
    subCategory: learnedMapping.subCategory || transaction.subCategory || '',
    subSubCategory: learnedMapping.subSubCategory || transaction.subSubCategory || '',
    isFixed: learnedMapping.isFixed ?? transaction.isFixed,
    accountId: transaction.accountId || learnedMapping.accountId || '',
    sourceAccountId: transaction.sourceAccountId || transaction.accountId || learnedMapping.sourceAccountId || learnedMapping.accountId || '',
    toAccountId: transaction.toAccountId || (transaction.type === 'transfer' ? learnedMapping.toAccountId || '' : ''),
    paymentType: transaction.paymentType && transaction.paymentType !== 'Otro' ? transaction.paymentType : learnedMapping.paymentType || transaction.paymentType,
    beneficiaryType: transaction.beneficiaryType || learnedMapping.beneficiaryType,
    beneficiaryLabel: transaction.beneficiaryLabel || learnedMapping.beneficiaryLabel,
    scope: transaction.scope || learnedMapping.scope,
    visibility: transaction.visibility || learnedMapping.visibility,
    merchantName: learnedMapping.merchantName || transaction.merchantName,
    merchantKey: learnedMapping.merchantKey || transaction.merchantKey,
  };
}

export function buildPendingImportGroups(transactions: PendingTransaction[]): PendingImportGroup[] {
  const groups = new Map<string, PendingTransaction[]>();

  for (const transaction of transactions) {
    const key = getPendingImportGroupKey(transaction);
    groups.set(key, [...(groups.get(key) || []), transaction]);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const first = items[0];
      const duplicateCount = items.filter(item => item.duplicateReason).length;
      const missingAccountCount = items.filter(pendingTransactionNeedsAccount).length;
      const kind: PendingImportGroup['kind'] = duplicateCount === items.length
        ? 'duplicate'
        : missingAccountCount > 0
          ? 'missing_account'
          : 'mixed_review';
      const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const title = kind === 'duplicate'
        ? 'Posibles duplicados'
        : kind === 'missing_account'
          ? 'Falta cuenta'
          : 'Revisar similares';
      const detailParts = [
        first.category,
        first.subCategory,
        first.merchantName,
        first.fileName,
      ].filter(Boolean);

      return {
        key,
        kind,
        title,
        detail: detailParts.join(' / ') || first.description || first.originalDescription || 'Movimiento importado',
        count: items.length,
        totalAmount,
        currency: first.currency || 'ARS',
        category: first.category || '',
        subCategory: first.subCategory || '',
        type: first.type,
        transactionIds: items.map(item => item.id),
        sample: first,
        canBulkConfirm: items.every(canConfirmPendingTransaction),
      };
    })
    .filter(group => group.count > 1 || group.kind !== 'mixed_review')
    .sort((a, b) => {
      const priority = { duplicate: 0, missing_account: 1, mixed_review: 2 };
      return priority[a.kind] - priority[b.kind] || b.count - a.count || b.totalAmount - a.totalAmount;
    })
    .slice(0, 8);
}

export function getPendingImportGroupKey(transaction: PendingTransaction) {
  if (transaction.duplicateReason) {
    const statementKey = transaction.statementFingerprint ? shortFingerprint(transaction.statementFingerprint) : '';
    return `duplicate:${statementKey || transaction.fileName || 'pdf'}:${transaction.category}:${transaction.subCategory || ''}`;
  }

  if (pendingTransactionNeedsAccount(transaction)) {
    return [
      'missing-account',
      transaction.type,
      transaction.currency || 'ARS',
      transaction.importSource || transaction.fileName || 'pdf',
      transaction.category || '',
      transaction.subCategory || '',
    ].join(':');
  }

  return [
    'review',
    transaction.type,
    transaction.currency || 'ARS',
    transaction.category || '',
    transaction.subCategory || '',
    transaction.merchantKey || normalizeDuplicateText(transaction.description || transaction.originalDescription || ''),
  ].join(':');
}
