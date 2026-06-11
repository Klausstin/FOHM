import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type BackupPayload = {
  schema?: string;
  exportedAt?: string;
  householdId?: string;
  exportedBy?: {
    uid?: string;
    email?: string;
    displayName?: string;
  };
  counts?: {
    accounts?: number;
    transactions?: number;
    categories?: number;
    learningMappings?: number;
    pendingTransactions?: number;
  };
  accounts?: any[];
  transactions?: any[];
  categories?: any[];
  learningMappings?: any[];
  pendingTransactions?: any[];
};

type ValidationResult = {
  errors: string[];
  warnings: string[];
};

function printUsage() {
  console.log('Uso: npm run finance:backup:validate -- "C:\\ruta\\al\\veo-finanzas-backup.json"');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateArray(name: keyof BackupPayload, payload: BackupPayload, result: ValidationResult) {
  if (!Array.isArray(payload[name])) {
    result.errors.push(`Falta el arreglo "${String(name)}".`);
  }
}

function validateCount(name: keyof NonNullable<BackupPayload['counts']>, arrayName: keyof BackupPayload, payload: BackupPayload, result: ValidationResult) {
  const expected = payload.counts?.[name];
  const actual = Array.isArray(payload[arrayName]) ? payload[arrayName]?.length : undefined;

  if (typeof expected !== 'number') {
    result.warnings.push(`El backup no informa conteo para "${String(name)}".`);
    return;
  }

  if (expected !== actual) {
    result.errors.push(`Conteo inconsistente para "${String(arrayName)}": el backup declara ${expected}, pero contiene ${actual}.`);
  }
}

function validateAccounts(payload: BackupPayload, result: ValidationResult) {
  const accounts = payload.accounts || [];
  const ids = new Set<string>();

  accounts.forEach((account, index) => {
    if (!account?.id) result.errors.push(`Cuenta #${index + 1} sin id.`);
    if (!account?.name) result.warnings.push(`Cuenta #${index + 1} sin nombre.`);
    if (!account?.currency) result.warnings.push(`Cuenta ${account?.name || account?.id || `#${index + 1}`} sin moneda.`);
    if (account?.id) ids.add(account.id);
  });

  return ids;
}

function validateTransactions(payload: BackupPayload, accountIds: Set<string>, result: ValidationResult) {
  const transactions = payload.transactions || [];
  const fingerprints = new Map<string, number>();

  transactions.forEach((transaction, index) => {
    const label = transaction?.description || transaction?.id || `#${index + 1}`;
    const amount = Number(transaction?.amount);
    const accountId = transaction?.sourceAccountId || transaction?.accountId || '';

    if (!transaction?.id) result.warnings.push(`Movimiento ${label} sin id.`);
    if (!Number.isFinite(amount)) result.errors.push(`Movimiento ${label} tiene monto invalido.`);
    if (!transaction?.date) result.warnings.push(`Movimiento ${label} sin fecha.`);
    if (!transaction?.currency) result.warnings.push(`Movimiento ${label} sin moneda.`);
    if (!transaction?.type) result.warnings.push(`Movimiento ${label} sin tipo.`);

    if (accountId && !accountIds.has(accountId)) {
      result.warnings.push(`Movimiento ${label} apunta a una cuenta que no esta en el backup: ${accountId}.`);
    }

    if (transaction?.toAccountId && !accountIds.has(transaction.toAccountId)) {
      result.warnings.push(`Movimiento ${label} apunta a una cuenta destino que no esta en el backup: ${transaction.toAccountId}.`);
    }

    const fingerprint = transaction?.transactionFingerprint;
    if (fingerprint) {
      fingerprints.set(fingerprint, (fingerprints.get(fingerprint) || 0) + 1);
    }
  });

  const duplicateFingerprintCount = Array.from(fingerprints.values()).filter(count => count > 1).length;
  if (duplicateFingerprintCount > 0) {
    result.warnings.push(`${duplicateFingerprintCount} huella(s) de movimiento aparecen mas de una vez. Puede ser correcto, pero conviene revisar duplicados.`);
  }
}

function validateBackup(payload: BackupPayload) {
  const result: ValidationResult = { errors: [], warnings: [] };

  if (!isObject(payload)) {
    result.errors.push('El archivo no contiene un objeto JSON valido de backup.');
    return result;
  }

  if (payload.schema !== 'veo.finance.backup.v1') {
    result.errors.push(`Schema inesperado: ${payload.schema || 'sin schema'}.`);
  }

  if (!payload.exportedAt) result.warnings.push('El backup no informa fecha de exportacion.');
  if (!payload.householdId) result.warnings.push('El backup no informa householdId.');
  if (!payload.exportedBy?.uid && !payload.exportedBy?.email) result.warnings.push('El backup no informa usuario exportador.');

  validateArray('accounts', payload, result);
  validateArray('transactions', payload, result);
  validateArray('categories', payload, result);
  validateArray('learningMappings', payload, result);
  validateArray('pendingTransactions', payload, result);

  validateCount('accounts', 'accounts', payload, result);
  validateCount('transactions', 'transactions', payload, result);
  validateCount('categories', 'categories', payload, result);
  validateCount('learningMappings', 'learningMappings', payload, result);
  validateCount('pendingTransactions', 'pendingTransactions', payload, result);

  const accountIds = validateAccounts(payload, result);
  validateTransactions(payload, accountIds, result);

  return result;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath || filePath === '--help' || filePath === '-h') {
    printUsage();
    process.exit(filePath ? 0 : 1);
  }

  const absolutePath = resolve(filePath);
  let payload: BackupPayload;

  try {
    payload = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    console.error(`No pude leer o parsear el backup: ${absolutePath}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const result = validateBackup(payload);
  const counts = payload.counts || {};

  console.log('Backup VEO Finanzas');
  console.log(`Archivo: ${absolutePath}`);
  console.log(`Exportado: ${payload.exportedAt || 'sin fecha'}`);
  console.log(`Household: ${payload.householdId || 'sin household'}`);
  console.log(`Exportado por: ${payload.exportedBy?.email || payload.exportedBy?.displayName || payload.exportedBy?.uid || 'sin usuario'}`);
  console.log('');
  console.log(`Cuentas: ${counts.accounts ?? 0}`);
  console.log(`Movimientos: ${counts.transactions ?? 0}`);
  console.log(`Categorias: ${counts.categories ?? 0}`);
  console.log(`Aprendizajes: ${counts.learningMappings ?? 0}`);
  console.log(`Pendientes de importacion: ${counts.pendingTransactions ?? 0}`);
  console.log('');

  if (result.errors.length) {
    console.log('Errores');
    result.errors.forEach(error => console.log(`- ${error}`));
  }

  if (result.warnings.length) {
    console.log(result.errors.length ? '' : 'Advertencias');
    result.warnings.forEach(warning => console.log(`- ${warning}`));
  }

  if (!result.errors.length && !result.warnings.length) {
    console.log('El backup parece sano.');
  } else if (!result.errors.length) {
    console.log('');
    console.log('El backup no tiene errores bloqueantes, pero conviene revisar las advertencias.');
  } else {
    console.log('');
    console.log('El backup tiene errores bloqueantes. No lo uses como fuente de recuperacion sin revisarlo.');
    process.exit(1);
  }
}

main();
