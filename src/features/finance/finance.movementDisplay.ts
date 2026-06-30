// Helpers de display de movimientos: etiquetas de cuenta, nombre de movimiento
// neutro, detalles del rastro y texto de búsqueda. Extraído de FinanceTracker.tsx.
import { isInternalTransferCategory, isCreditCardPaymentCategory } from './finance.duplicates';
import { parseFinanceTraceNote, inferStatementMerchant } from './finance.trace';

export function financeNeedsDestinationAccount(finance: any) {
  const type = String(finance?.type || finance?.kind || '').toLowerCase();
  const kind = String(finance?.kind || '').toLowerCase();
  const neutralType = String(finance?.neutralType || '').toLowerCase();

  if (type === 'transfer') return true;
  if ((type === 'neutral' || kind === 'neutral') && [
    'internal_transfer',
    'credit_card_payment',
    'currency_exchange',
    'investment_movement',
    'loan_movement',
  ].includes(neutralType)) return true;

  return isInternalTransferCategory(finance?.category, finance?.subCategory);
}

export function getFinanceAccountFieldLabel(finance: any) {
  const type = String(finance?.type || finance?.kind || '').toLowerCase();
  if (financeNeedsDestinationAccount(finance)) return 'Cuenta origen';
  if (type === 'income') return 'Cuenta donde entra';
  return 'Cuenta usada';
}

export function getFinanceTypeLabel(type?: string) {
  if (type === 'income') return 'Ingreso';
  if (type === 'transfer') return 'Transferencia';
  if (type === 'neutral') return 'Movimiento neutro';
  return 'Gasto';
}

export function getNeutralMovementLabel(finance: any) {
  const neutralType = String(finance?.neutralType || '').toLowerCase();
  if (neutralType === 'credit_card_payment' || isCreditCardPaymentCategory(finance?.category, finance?.subCategory)) return 'Pago de tarjeta';
  if (neutralType === 'currency_exchange') return 'Cambio de moneda';
  if (neutralType === 'investment_movement') return 'Inversion';
  if (neutralType === 'loan_movement') return 'Prestamo';
  if (neutralType === 'balance_adjustment') return 'Ajuste de saldo';
  return 'Transferencia';
}

export function getMovementCategoryDisplay(finance: any) {
  if (finance?.type === 'transfer') {
    return {
      primary: getNeutralMovementLabel(finance),
      secondary: 'Transferencia',
    };
  }

  return {
    primary: finance?.subCategory || finance?.category || 'Sin categoria',
    secondary: finance?.subCategory ? finance?.category : '',
  };
}

export function buildFinanceTraceDetails(finance: any, accounts: any[]) {
  const trace = parseFinanceTraceNote(finance.note);
  const sourceAccount = accounts.find(account => account.id === (finance.sourceAccountId || finance.accountId));
  const destinationAccount = accounts.find(account => account.id === finance.toAccountId);
  const merchant = inferStatementMerchant(finance, trace);

  return {
    trace,
    merchant,
    sourceAccount,
    destinationAccount,
    rows: [
      { label: getFinanceAccountFieldLabel(finance), value: sourceAccount?.name || 'Sin cuenta' },
      ...(financeNeedsDestinationAccount(finance) ? [{ label: 'Cuenta destino', value: destinationAccount?.name || '-' }] : []),
      { label: 'Destinatario', value: trace.counterpartyName || '-' },
      { label: 'Alias', value: trace.counterpartyAlias || '-' },
      { label: 'CBU/CVU', value: trace.counterpartyAccount || '-' },
      { label: 'Archivo', value: trace.importedFile || finance.importSource || '-' },
      { label: 'Tarjeta', value: trace.cardLast4 || finance.cardLast4 || '-' },
      { label: 'Comprobante', value: trace.voucherNumber || finance.voucherNumber || '-' },
      { label: 'Cuotas', value: trace.installmentLabel || finance.installmentLabel || '-' },
      { label: 'Huella', value: finance.transactionFingerprint || finance.statementFingerprint || '-' },
    ],
    longRows: [
      { label: 'Concepto original', value: trace.originalConcept || finance.originalDescription || '' },
      { label: 'Linea del resumen', value: trace.sourceLine || '' },
      { label: 'Detalle tarjeta debito', value: trace.debitCardDetailLine || finance.debitCardDetailLine || '' },
      { label: 'Detalle transferencia', value: trace.transferDetail || '' },
    ].filter(row => row.value),
  };
}

export function getFinanceSearchText(finance: any, accounts: any[], members: any[]) {
  const sourceAccount = accounts.find(account => account.id === (finance.sourceAccountId || finance.accountId));
  const destinationAccount = accounts.find(account => account.id === finance.toAccountId);
  const generator = members.find(member => member.uid === finance.generatedBy || member.id === finance.generatedBy);
  const trace = parseFinanceTraceNote(finance.note);

  return [
    finance.id,
    finance.description,
    finance.note,
    finance.category,
    finance.subCategory,
    finance.subSubCategory,
    finance.type,
    finance.currency,
    finance.amount,
    finance.paymentType,
    finance.paymentStatus,
    finance.source,
    finance.confidence,
    finance.importSource,
    finance.merchantName,
    finance.merchant,
    finance.merchantKey,
    finance.beneficiaryLabel,
    finance.scope,
    finance.originalDescription,
    finance.duplicateReason,
    sourceAccount?.name,
    sourceAccount?.currency,
    sourceAccount?.type,
    destinationAccount?.name,
    destinationAccount?.currency,
    destinationAccount?.type,
    generator?.displayName,
    generator?.email,
    trace.originalConcept,
    trace.transferDetail,
    trace.counterpartyName,
    trace.counterpartyAlias,
    trace.counterpartyAccount,
    trace.importedFile,
    trace.installmentLabel,
    trace.sourceLine,
    finance.projectId,
    ...trace.reconciliations,
    ...trace.otherLines,
    ...(Array.isArray(finance.tags) ? finance.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
