// Backup y exportación de finanzas (JSON + CSV).
// Extraído de FinanceTracker.tsx (Fase A del refactor).
import { format } from 'date-fns';
import { unparse } from 'papaparse';
import type { PendingTransaction } from './finance.importTypes';
import { parseFinanceDateValue, legacyBeneficiaryLabel } from './finance.format';

export function toBackupSafeValue(value: any): any {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toBackupSafeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => typeof entryValue !== 'function')
        .map(([key, entryValue]) => [key, toBackupSafeValue(entryValue)]),
    );
  }
  return value;
}

export function buildFinanceBackupPayload(input: {
  user: any;
  finances: any[];
  accounts: any[];
  categories: any[];
  mappings: any[];
  pendingTransactions: PendingTransaction[];
}) {
  return toBackupSafeValue({
    schema: 'veo.finance.backup.v1',
    exportedAt: new Date(),
    householdId: input.user?.householdId || '',
    exportedBy: {
      uid: input.user?.uid || '',
      email: input.user?.email || '',
      displayName: input.user?.displayName || '',
    },
    counts: {
      accounts: input.accounts.length,
      transactions: input.finances.length,
      categories: input.categories.length,
      learningMappings: input.mappings.length,
      pendingTransactions: input.pendingTransactions.length,
    },
    accounts: input.accounts,
    transactions: input.finances,
    categories: input.categories,
    learningMappings: input.mappings,
    pendingTransactions: input.pendingTransactions,
  });
}

export function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildFinanceBackupFileName() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `veo-finanzas-backup-${stamp}.json`;
}

export function buildFinanceCsvFileName() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `veo-finanzas-movimientos-${stamp}.csv`;
}

export function formatFinanceDateForExport(value: any) {
  const date = parseFinanceDateValue(value);
  return date ? format(date, 'yyyy-MM-dd HH:mm') : '';
}

export function buildFinanceTransactionsCsv(finances: any[], accounts: any[]) {
  const accountById = new Map((accounts || []).map(account => [account.id, account]));

  const rows = (finances || []).map(finance => {
    const sourceAccount = accountById.get(finance.sourceAccountId || finance.accountId);
    const destinationAccount = accountById.get(finance.toAccountId);
    const tags = Array.isArray(finance.tags) ? finance.tags.join(', ') : '';

    return {
      fecha: formatFinanceDateForExport(finance.date),
      tipo: finance.type || finance.kind || '',
      monto: Number(finance.amount || 0),
      moneda: finance.currency || 'ARS',
      categoria: finance.category || '',
      subcategoria: finance.subCategory || finance.subcategory || '',
      detalle: finance.subSubCategory || finance.detail || '',
      descripcion: finance.description || '',
      nota: finance.note || finance.notes || '',
      cuenta_usada: sourceAccount?.name || finance.accountName || finance.sourceAccountLabel || '',
      cuenta_destino: destinationAccount?.name || '',
      comercio: finance.merchantName || finance.merchant || '',
      para: finance.beneficiaryLabel || legacyBeneficiaryLabel(finance),
      ambito: finance.scope || '',
      medio_pago: finance.paymentType || '',
      estado_pago: finance.paymentStatus || '',
      proyecto: finance.projectId || '',
      gasto_fijo: finance.isFixed ? 'si' : 'no',
      impacta_saldo: finance.accountBalanceApplied ? 'si' : 'no',
      origen: finance.importSource || finance.source || '',
      archivo: finance.importFileName || finance.statementFileName || finance.statementAccountLabel || '',
      huella_movimiento: finance.transactionFingerprint || '',
      huella_resumen: finance.statementFingerprint || '',
      tags,
    };
  });

  return unparse(rows, { quotes: true });
}
