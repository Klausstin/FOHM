import fs from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const CONFIRMATION_PHRASE = 'BORRAR DATOS FINANCIEROS DE PRUEBA';

interface ResetArgs {
  apply: boolean;
  email?: string;
  uid?: string;
  householdId?: string;
  confirm?: string;
  resetBalances: 'zero' | 'preserve';
  keepMappings: boolean;
}

interface UserContext {
  uid: string;
  email?: string;
  householdId: string;
}

interface ResetPlan {
  finances: FirebaseFirestore.QueryDocumentSnapshot[];
  mappings: FirebaseFirestore.QueryDocumentSnapshot[];
  accounts: FirebaseFirestore.QueryDocumentSnapshot[];
  categories: FirebaseFirestore.QueryDocumentSnapshot[];
  importBatchCount: number;
  reconciliationCount: number;
  balanceAdjustmentCount: number;
  duplicateLinkCount: number;
}

let db: FirebaseFirestore.Firestore;

main().catch(error => {
  handleScriptError(error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: firebaseConfig.projectId });
  }

  db = getFirestore(firebaseConfig.firestoreDatabaseId);

  const userContext = await resolveUserContext(args);
  const plan = await buildResetPlan(userContext, args);
  const outputDir = await writePreResetBackups(userContext, plan);

  printPlan(userContext, plan, outputDir, args);

  if (!args.apply) {
    console.log('');
    console.log('Modo dry-run. No borre nada.');
    console.log(`Para borrar, repetir con --apply --confirm "${CONFIRMATION_PHRASE}"`);
    process.exit(0);
  }

  if (args.confirm !== CONFIRMATION_PHRASE) {
    console.error('');
    console.error('Confirmacion invalida. No borre nada.');
    console.error(`La frase exacta requerida es: ${CONFIRMATION_PHRASE}`);
    process.exit(1);
  }

  await executeReset(plan, args);
  const postAccounts = await db.collection('accounts')
    .where('householdId', '==', userContext.householdId)
    .get();

  console.log('');
  console.log('Reset financiero completado.');
  console.log(`Movimientos borrados: ${plan.finances.length}`);
  console.log(`Aprendizajes borrados: ${args.keepMappings ? 0 : plan.mappings.length}`);
  console.log(`Cuentas preservadas: ${postAccounts.size}`);
  console.log(`Categorias preservadas: ${plan.categories.length}`);
  console.log(`Backups previos: ${outputDir}`);
  console.log('');
  console.log('Saldos resultantes:');
  postAccounts.docs.forEach(doc => {
    const account = doc.data();
    console.log(`- ${account.name || doc.id}: ${Number(account.balance || 0).toLocaleString()} ${account.currency || ''}`.trim());
  });
  console.log('');
  console.log('Ahora correr: npm run finance:smoke');
}

async function resolveUserContext(input: ResetArgs): Promise<UserContext> {
  if (input.uid && input.householdId) {
    return { uid: input.uid, householdId: input.householdId };
  }

  if (!input.email) {
    printUsage();
    throw new Error('Necesito --email o --uid junto con --household.');
  }

  const users = await db.collection('users')
    .where('email', '==', input.email)
    .limit(1)
    .get();

  if (users.empty) {
    throw new Error(`No encontre usuario con email ${input.email}.`);
  }

  const userDoc = users.docs[0];
  const data = userDoc.data();
  if (!data.householdId) {
    throw new Error(`El usuario ${input.email} no tiene householdId configurado.`);
  }

  return {
    uid: data.uid || userDoc.id,
    email: data.email || input.email,
    householdId: data.householdId,
  };
}

async function buildResetPlan(user: UserContext, input: ResetArgs): Promise<ResetPlan> {
  const [finances, mappings, accounts, categories] = await Promise.all([
    db.collection('finances').where('householdId', '==', user.householdId).get(),
    db.collection('mappings').where('householdId', '==', user.householdId).get(),
    db.collection('accounts').where('householdId', '==', user.householdId).get(),
    db.collection('categories').where('householdId', '==', user.householdId).get(),
  ]);

  const importBatchKeys = new Set<string>();
  let reconciliationCount = 0;
  let balanceAdjustmentCount = 0;
  let duplicateLinkCount = 0;

  finances.docs.forEach(doc => {
    const data = doc.data();
    if (data.statementFingerprint) importBatchKeys.add(`statement:${data.statementFingerprint}`);
    if (data.reconciliationBatchId) importBatchKeys.add(`reconciliation:${data.reconciliationBatchId}`);
    if (data.importFileName) importBatchKeys.add(`file:${data.importFileName}`);
    if (data.statementAccountLabel && data.importSource) importBatchKeys.add(`source:${data.importSource}:${data.statementAccountLabel}`);
    if (data.reconciliationBatchId) reconciliationCount += 1;
    if (data.neutralType === 'balance_adjustment' || String(data.description || '').toLowerCase().includes('ajuste de')) balanceAdjustmentCount += 1;
    if (data.duplicateOfId || data.duplicateReason) duplicateLinkCount += 1;
  });

  return {
    finances: finances.docs,
    mappings: input.keepMappings ? [] : mappings.docs,
    accounts: accounts.docs,
    categories: categories.docs,
    importBatchCount: importBatchKeys.size,
    reconciliationCount,
    balanceAdjustmentCount,
    duplicateLinkCount,
  };
}

async function writePreResetBackups(user: UserContext, plan: ResetPlan) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const outputDir = path.join(process.cwd(), '.veo-local-imports', 'finance-reset-backups', stamp);
  await fs.mkdir(outputDir, { recursive: true });

  const accounts = plan.accounts.map(toPlainDoc);
  const transactions = plan.finances.map(toPlainDoc);
  const categories = plan.categories.map(toPlainDoc);
  const learningMappings = plan.mappings.map(toPlainDoc);

  const backup = {
    schema: 'veo.finance.backup.v1',
    exportedAt: new Date().toISOString(),
    reason: 'pre_finance_test_data_reset',
    householdId: user.householdId,
    exportedBy: {
      uid: user.uid,
      email: user.email || '',
    },
    counts: {
      accounts: accounts.length,
      transactions: transactions.length,
      categories: categories.length,
      learningMappings: learningMappings.length,
      pendingTransactions: 0,
    },
    accounts,
    transactions,
    categories,
    learningMappings,
    pendingTransactions: [],
  };

  await fs.writeFile(path.join(outputDir, 'finance-reset-backup.json'), JSON.stringify(backup, null, 2), 'utf8');
  await fs.writeFile(path.join(outputDir, 'finance-reset-transactions.csv'), buildTransactionsCsv(transactions, accounts), 'utf8');
  await fs.writeFile(path.join(outputDir, 'finance-reset-summary.json'), JSON.stringify(buildSummary(user, plan), null, 2), 'utf8');

  return outputDir;
}

function toPlainDoc(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  return toJsonSafeValue({ id: doc.id, ...doc.data() });
}

function toJsonSafeValue(value: any): any {
  if (value == null) return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, toJsonSafeValue(entryValue)]));
  }
  return value;
}

function buildTransactionsCsv(transactions: any[], accounts: any[]) {
  const accountById = new Map(accounts.map(account => [account.id, account]));

  return Papa.unparse(transactions.map(transaction => {
    const sourceAccount = accountById.get(transaction.sourceAccountId || transaction.accountId);
    const destinationAccount = accountById.get(transaction.toAccountId);
    return {
      fecha: transaction.date || '',
      tipo: transaction.type || '',
      monto: Number(transaction.amount || 0),
      moneda: transaction.currency || '',
      categoria: transaction.category || '',
      subcategoria: transaction.subCategory || '',
      descripcion: transaction.description || '',
      cuenta_usada: sourceAccount?.name || transaction.accountName || '',
      cuenta_destino: destinationAccount?.name || '',
      comercio: transaction.merchantName || transaction.merchant || '',
      para: transaction.beneficiaryLabel || '',
      origen: transaction.importSource || transaction.source || '',
      huella_movimiento: transaction.transactionFingerprint || '',
      huella_resumen: transaction.statementFingerprint || '',
    };
  }), { quotes: true });
}

function buildSummary(user: UserContext, plan: ResetPlan) {
  return {
    householdId: user.householdId,
    uid: user.uid,
    email: user.email || '',
    dryRunGeneratedAt: new Date().toISOString(),
    wouldDelete: {
      financialTransactions: plan.finances.length,
      importBatches: plan.importBatchCount,
      reconciliations: plan.reconciliationCount,
      balanceAdjustments: plan.balanceAdjustmentCount,
      duplicateLinks: plan.duplicateLinkCount,
      financeLearningMappings: plan.mappings.length,
    },
    wouldPreserve: {
      accounts: plan.accounts.length,
      categories: plan.categories.length,
      users: true,
      household: true,
      journal: true,
      goals: true,
      habits: true,
      wishlist: true,
      settings: true,
    },
  };
}

function printPlan(user: UserContext, plan: ResetPlan, outputDir: string, input: ResetArgs) {
  const summary = buildSummary(user, plan);
  console.log('Reset seguro de datos financieros de prueba');
  console.log('');
  console.log(`Usuario: ${user.email || user.uid}`);
  console.log(`Household: ${user.householdId}`);
  console.log(`Modo: ${input.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Saldos de cuentas: ${input.resetBalances === 'zero' ? 'se dejarian en 0' : 'se preservarian'}`);
  console.log(`Aprendizajes financieros: ${input.keepMappings ? 'se preservarian' : 'se borrarian'}`);
  console.log('');
  console.log('Se borraria/resetearia:');
  console.log(`- Movimientos financieros: ${summary.wouldDelete.financialTransactions}`);
  console.log(`- Importaciones detectadas: ${summary.wouldDelete.importBatches}`);
  console.log(`- Conciliaciones/movimientos con lote: ${summary.wouldDelete.reconciliations}`);
  console.log(`- Ajustes de saldo: ${summary.wouldDelete.balanceAdjustments}`);
  console.log(`- Vinculos/huellas de duplicados: ${summary.wouldDelete.duplicateLinks}`);
  console.log(`- Aprendizajes/memoria financiera: ${summary.wouldDelete.financeLearningMappings}`);
  console.log('');
  console.log('Se preservaria:');
  console.log(`- Cuentas/billeteras/tarjetas: ${summary.wouldPreserve.accounts}`);
  console.log(`- Categorias/subcategorias: ${summary.wouldPreserve.categories}`);
  console.log('- Usuarios, household, Diario, Objetivos, Habitos, Wishlist y Ajustes');
  console.log('');
  console.log(`Backup previo generado en: ${outputDir}`);
}

async function executeReset(plan: ResetPlan, input: ResetArgs) {
  await deleteDocs(plan.finances);
  if (!input.keepMappings) await deleteDocs(plan.mappings);

  if (input.resetBalances === 'zero') {
    await updateAccountsToZero(plan.accounts);
  }
}

async function deleteDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const chunkSize = 400;
  for (let index = 0; index < docs.length; index += chunkSize) {
    const batch = db.batch();
    docs.slice(index, index + chunkSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function updateAccountsToZero(accounts: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const chunkSize = 400;
  for (let index = 0; index < accounts.length; index += chunkSize) {
    const batch = db.batch();
    accounts.slice(index, index + chunkSize).forEach(doc => {
      batch.update(doc.ref, {
        balance: 0,
        lastReconciledAt: null,
        updatedAt: new Date(),
      });
    });
    await batch.commit();
  }
}

function parseArgs(values: string[]): ResetArgs {
  const parsed: ResetArgs = {
    apply: false,
    resetBalances: 'zero',
    keepMappings: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--apply') parsed.apply = true;
    if (value === '--email') parsed.email = values[index + 1];
    if (value === '--uid') parsed.uid = values[index + 1];
    if (value === '--household') parsed.householdId = values[index + 1];
    if (value === '--confirm') parsed.confirm = values[index + 1];
    if (value === '--reset-balances') {
      const nextValue = values[index + 1];
      parsed.resetBalances = nextValue === 'preserve' ? 'preserve' : 'zero';
    }
    if (value === '--keep-mappings') parsed.keepMappings = true;
  }

  return parsed;
}

function printUsage() {
  console.log('Uso dry-run:');
  console.log('  npm run finance:reset-test-data -- --email agustin@granberta.com');
  console.log('');
  console.log('Uso con borrado real:');
  console.log(`  npm run finance:reset-test-data -- --email agustin@granberta.com --apply --confirm "${CONFIRMATION_PHRASE}"`);
  console.log('');
  console.log('Opciones:');
  console.log('  --uid <uid> --household <householdId>  Usar ids directos en vez de email');
  console.log('  --reset-balances zero|preserve         Default: zero');
  console.log('  --keep-mappings                        Preserva memoria financiera');
}

function handleScriptError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('Could not load the default credentials') || message.includes('default credentials')) {
    console.error('');
    console.error('No pude conectarme a Firestore porque falta la credencial admin local.');
    console.error('No borre nada: el script fallo antes de leer o modificar datos.');
    console.error('');
    console.error('Importante: firebase login sirve para deploys, pero este script usa firebase-admin.');
    console.error('Para correrlo localmente hace falta configurar Application Default Credentials una vez.');
    console.error('');
    console.error('Camino recomendado:');
    console.error('  1. Instalar Google Cloud CLI si no esta instalado.');
    console.error('  2. Correr: gcloud auth application-default login --account=agustin@granberta.com');
    console.error('  3. Reintentar dry-run: npm run finance:reset-test-data -- --email agustin@granberta.com');
    console.error('');
    console.error('Alternativa tecnica: usar una service account y GOOGLE_APPLICATION_CREDENTIALS.');
    return;
  }

  console.error('');
  console.error('No pude completar el reset financiero. No continuo con el borrado.');
  console.error(message);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}
