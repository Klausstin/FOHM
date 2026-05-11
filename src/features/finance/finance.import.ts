import { suggestMerchant } from './finance.merchants.ts';

export interface ImportedFinanceTransaction {
  amount: number;
  description: string;
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  type: 'expense' | 'income' | 'transfer';
  date: string;
  isFixed: boolean;
  confidence: number;
  needsReview: boolean;
  merchantName?: string;
  merchantKey?: string;
  importSource?: string;
  balanceDelta?: number;
  transactionFingerprint?: string;
  statementFingerprint?: string;
}

export interface FinanceImportResult {
  source: 'bbva_caja_ahorro_ars' | 'bbva_visa' | 'unknown';
  transactions: ImportedFinanceTransaction[];
  statement?: ImportedFinanceStatement;
  warnings?: string[];
}

export interface ImportedFinanceStatement {
  accountLabel?: string;
  currency: 'ARS' | 'USD' | string;
  periodEnd?: string;
  previousBalance?: number;
  closingBalance?: number;
  totalDebits?: number;
  totalCredits?: number;
  transactionCount: number;
  balanceCheck?: {
    expectedClosingBalance: number;
    difference: number;
    isBalanced: boolean;
  };
  statementFingerprint?: string;
}

const BBVA_MOVEMENT_RE =
  /^(\d{2}\/\d{2})\s+(?:(\d{3})\s+)?(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})$/;
const BBVA_VISA_TRANSACTION_RE =
  /^(\d{1,2})-([A-Za-zÁÉÍÓÚáéíóú]{3})-(\d{2})\s+(.+?)\s+(?:(\d{3,})\s+)?(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})(?:\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}))?$/;

export function parseFinanceStatementText(text: string, fileName = ''): FinanceImportResult {
  const normalizedText = normalizeWhitespace(text);
  const comparableText = normalizeLooseText(normalizedText);
  const isBbvaCajaAhorroArs =
    (/Movimientos en cuentas/i.test(normalizedText) || /FECHA\s+ORIGEN\s+CONCEPTO/i.test(normalizedText)) &&
    /SALDO ANTERIOR/i.test(normalizedText) &&
    /TOTAL MOVIMIENTOS/i.test(normalizedText) &&
    /CA \$|Caja de Ahorro|Cuenta Sueldo|Banco BBVA Argentina/i.test(normalizedText);

  const isBbvaVisa =
    comparableText.includes('tarjetas de credito') &&
    comparableText.includes('visa') &&
    comparableText.includes('cierre actual') &&
    comparableText.includes('saldo actual');

  if (isBbvaVisa) {
    return {
      source: 'bbva_visa',
      ...parseBbvaVisa(normalizedText, fileName),
    };
  }

  if (!isBbvaCajaAhorroArs) {
    return { source: 'unknown', transactions: [] };
  }

  return {
    source: 'bbva_caja_ahorro_ars',
    ...parseBbvaCajaAhorroArs(normalizedText, fileName),
  };
}

function parseBbvaVisa(text: string, fileName: string): Omit<FinanceImportResult, 'source'> {
  const year = inferYearFromFileName(fileName) || inferYearFromStatementText(text) || new Date().getFullYear();
  const statement = parseBbvaVisaStatementHeader(text, year);
  const warnings: string[] = [];
  const transactions = parseBbvaVisaTransactions(text, year);

  const totalExpenses = roundMoney(transactions.filter(transaction => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0));
  if (typeof statement.totalDebits === 'number' && Math.abs(roundMoney(totalExpenses - statement.totalDebits)) >= 0.02) {
    warnings.push(`Los consumos detectados suman ${totalExpenses.toFixed(2)} y el resumen informa ${statement.totalDebits.toFixed(2)}.`);
  }

  const statementFingerprint = buildStatementFingerprint('bbva_visa', statement);
  statement.statementFingerprint = statementFingerprint;
  transactions.forEach(transaction => {
    transaction.statementFingerprint = statementFingerprint;
    transaction.transactionFingerprint = buildTransactionFingerprint(transaction);
  });

  return { transactions, statement, warnings };
}

function parseBbvaVisaTransactions(text: string, fallbackYear: number): ImportedFinanceTransaction[] {
  const lines = text.split(/\r?\n/).map(line => stripPdfLineNoise(line.trim())).filter(Boolean);
  const transactions: ImportedFinanceTransaction[] = [];
  let inConsumptionSection = false;

  for (const line of lines) {
    const comparableLine = normalizeLooseText(line);
    if (comparableLine.startsWith('consumos ')) {
      inConsumptionSection = true;
      continue;
    }
    if (inConsumptionSection && (
      comparableLine.startsWith('total consumos') ||
      comparableLine.startsWith('saldo actual') ||
      comparableLine.startsWith('legales') ||
      comparableLine.startsWith('plan v')
    )) {
      inConsumptionSection = false;
    }
    if (!inConsumptionSection) continue;
    if (isVisaNonMovementLine(line)) continue;
    const match = BBVA_VISA_TRANSACTION_RE.exec(line);
    if (!match) continue;

    const [, dayText, monthText, yearText, rawDescription, , rawPesos, rawDollars] = match;
    const description = cleanVisaDescription(rawDescription);
    if (!description || isVisaNonMovementDescription(description)) continue;

    const pesos = parseArgentineMoney(rawPesos);
    const dollars = rawDollars ? parseArgentineMoney(rawDollars) : 0;
    const amount = Math.abs(pesos || dollars);
    if (!amount) continue;

    const type = pesos < 0 || dollars < 0 ? 'income' as const : 'expense' as const;
    const merchant = suggestMerchant(description);
    const categorySuggestion = suggestVisaCategory(description, merchant);

    transactions.push({
      amount,
      description,
      category: categorySuggestion.category,
      subCategory: categorySuggestion.subCategory,
      type,
      date: buildIsoDate(resolveTwoDigitYear(yearText, fallbackYear), `${dayText.padStart(2, '0')}/${String(monthNumber(monthText) || 1).padStart(2, '0')}`),
      isFixed: merchant.isLikelyRecurring || categorySuggestion.isLikelyRecurring,
      confidence: Math.max(merchant.confidence, categorySuggestion.confidence),
      needsReview: merchant.confidence < 0.8 && categorySuggestion.confidence < 0.8,
      merchantName: merchant.confidence >= 0.8 ? merchant.merchantName : cleanVisaMerchantName(description),
      merchantKey: merchant.confidence >= 0.8 ? merchant.merchantKey : normalizeFingerprintText(description).replace(/\s+/g, '-'),
      importSource: 'bbva_visa',
      balanceDelta: type === 'expense' ? -amount : amount,
    });
  }

  return transactions;
}

function parseBbvaVisaStatementHeader(text: string, year: number): ImportedFinanceStatement {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const accountLine = lines.find(line => /Visa/i.test(line) && /cuenta/i.test(line)) || 'Visa BBVA';
  const compactHeaderIndex = lines.findIndex(line => normalizeLooseText(line).includes('cierre actual vencimiento actual saldo actual'));
  const compactHeaderValues = compactHeaderIndex >= 0 ? parseHeaderValueLine(lines[compactHeaderIndex + 1] || '') : null;
  const closeLineIndex = lines.findIndex(line => normalizeLooseText(line) === 'cierre actual');
  const closeDateLine = compactHeaderValues?.closeDate || (closeLineIndex >= 0 ? lines[closeLineIndex + 1] : '');
  const currentBalanceLineIndex = lines.findIndex(line => normalizeLooseText(line) === 'saldo actual $');
  const currentBalance = compactHeaderValues?.currentBalancePesos ?? (currentBalanceLineIndex >= 0 ? parseLastMoney(lines[currentBalanceLineIndex + 1] || '') : undefined);
  const totalConsumptionLine = lines.find(line => /^TOTAL CONSUMOS DE/i.test(line));
  const totalDebits = totalConsumptionLine ? parseTotalsMoney(totalConsumptionLine)[0] : undefined;
  const previousBalanceLine = lines.find(line => /^SALDO ANTERIOR/i.test(line));

  return {
    accountLabel: accountLine.replace(/\s+/g, ' '),
    currency: 'ARS',
    periodEnd: parseVisaDate(closeDateLine, year),
    previousBalance: previousBalanceLine ? parseTotalsMoney(previousBalanceLine)[0] : undefined,
    closingBalance: currentBalance,
    totalDebits,
    transactionCount: 0,
  };
}

function suggestVisaCategory(description: string, merchant: ReturnType<typeof suggestMerchant>) {
  const normalized = normalizeText(description);
  if (merchant.confidence >= 0.8) {
    return {
      category: merchant.category,
      subCategory: merchant.subCategory,
      isLikelyRecurring: merchant.isLikelyRecurring,
      confidence: merchant.confidence,
    };
  }
  if (/osde|medic|farmacia|hospital|clinica|salud/i.test(normalized)) {
    return { category: 'Salud', subCategory: 'Medicina', isLikelyRecurring: normalized.includes('osde'), confidence: 0.82 };
  }
  if (/personal|flow|edenor|metrogas|aysa|internet|telefono|celular/i.test(normalized)) {
    return { category: 'Servicios', subCategory: 'Hogar', isLikelyRecurring: true, confidence: 0.82 };
  }
  if (/hoyts|cinema|cine|teatro|ticket/i.test(normalized)) {
    return { category: 'Ocio', subCategory: 'Entretenimiento', isLikelyRecurring: false, confidence: 0.82 };
  }
  if (/kfc|restaurant|resto|bar|cafe|express|panader|super|market|carrefour|coto|dia/i.test(normalized)) {
    return { category: 'Comida', subCategory: 'Comidas y compras', isLikelyRecurring: false, confidence: 0.75 };
  }
  if (/autopista|peaje|ypf|shell|axion|estacionamiento/i.test(normalized)) {
    return { category: 'Transporte', subCategory: 'Auto', isLikelyRecurring: false, confidence: 0.75 };
  }
  if (/seguro|cia seg/i.test(normalized)) {
    return { category: 'Finanzas', subCategory: 'Seguros', isLikelyRecurring: true, confidence: 0.75 };
  }
  return { category: 'Sin categorizar', subCategory: '', isLikelyRecurring: false, confidence: 0.45 };
}

function isVisaNonMovementLine(line: string) {
  const normalized = normalizeLooseText(line);
  return normalized.startsWith('fecha descripcion') ||
    normalized.startsWith('total consumos') ||
    normalized.startsWith('saldo actual') ||
    normalized.startsWith('saldo anterior') ||
    normalized.startsWith('cierre') ||
    normalized.startsWith('vencimiento') ||
    normalized.startsWith('pago minimo');
}

function isVisaNonMovementDescription(description: string) {
  return /^(TOTAL|SALDO|CIERRE|VENCIMIENTO|PAGO MINIMO|TNA|TEM)/i.test(description);
}

function cleanVisaDescription(description: string) {
  return description
    .replace(/\s+/g, ' ')
    .replace(/\bID:\s*/i, 'ID:')
    .trim();
}

function cleanVisaMerchantName(description: string) {
  return description
    .replace(/\bID:[^\s]+/i, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHeaderValueLine(line: string) {
  const closeDateMatch = /\d{1,2}-[A-Za-zÁÉÍÓÚáéíóú]{3}-\d{2}/.exec(line);
  const moneyValues = line.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g) || [];
  return {
    closeDate: closeDateMatch?.[0],
    currentBalancePesos: moneyValues[0] ? parseArgentineMoney(moneyValues[0]) : undefined,
  };
}

function parseBbvaCajaAhorroArs(text: string, fileName: string): Omit<FinanceImportResult, 'source'> {
  const year = inferYearFromFileName(fileName) || inferYearFromStatementText(text) || new Date().getFullYear();
  const statementHeader = parseBbvaStatementHeader(text, year);
  const warnings: string[] = [];

  const transactions: ImportedFinanceTransaction[] = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(stripPdfLineNoise)
    .map(line => BBVA_MOVEMENT_RE.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map(match => {
      const [, datePart, , rawDescription, rawAmount] = match;
      const amount = parseArgentineMoney(rawAmount);
      const description = cleanMovementDescription(rawDescription);
      const suggestion = suggestMovementClassification(description, amount);
      const merchant = suggestMerchant(description);

      return {
        amount: Math.abs(amount),
        description,
        category: merchant.confidence >= 0.8 && suggestion.canUseMerchantCategory ? merchant.category : suggestion.category,
        subCategory: merchant.confidence >= 0.8 && suggestion.canUseMerchantCategory ? merchant.subCategory : suggestion.subCategory,
        type: suggestion.type,
        date: buildIsoDate(year, datePart),
        isFixed: suggestion.isFixed || merchant.isLikelyRecurring,
        confidence: Math.max(suggestion.confidence, merchant.confidence),
        needsReview: suggestion.needsReview || (suggestion.canUseMerchantCategory && merchant.confidence < 0.8),
        merchantName: merchant.confidence >= 0.8 ? merchant.merchantName : '',
        merchantKey: merchant.confidence >= 0.8 ? merchant.merchantKey : '',
        importSource: 'bbva_caja_ahorro_ars',
        balanceDelta: amount,
      };
    })
    .filter(transaction => transaction.amount > 0);

  const statement = buildStatementMetadata(statementHeader, transactions);
  const statementFingerprint = buildStatementFingerprint('bbva_caja_ahorro_ars', statement);
  statement.statementFingerprint = statementFingerprint;
  transactions.forEach(transaction => {
    transaction.statementFingerprint = statementFingerprint;
    transaction.transactionFingerprint = buildTransactionFingerprint(transaction);
  });

  if (statement.balanceCheck && !statement.balanceCheck.isBalanced) {
    warnings.push(`La conciliacion del resumen no cierra por ${statement.balanceCheck.difference.toFixed(2)}.`);
  }

  return { transactions, statement, warnings };
}

function suggestMovementClassification(description: string, signedAmount: number) {
  const normalized = normalizeText(description);

  if (normalized.includes('pago de haberes')) {
    return {
      type: 'income' as const,
      category: 'Ingresos',
      subCategory: 'Sueldo',
      isFixed: true,
      confidence: 0.92,
      needsReview: false,
      canUseMerchantCategory: false,
    };
  }

  if (normalized.includes('intereses ganados')) {
    return {
      type: 'income' as const,
      category: 'Ingresos',
      subCategory: 'Intereses',
      isFixed: false,
      confidence: 0.9,
      needsReview: false,
      canUseMerchantCategory: false,
    };
  }

  if (normalized.includes('cuenta visa') || normalized.includes('pago de servicios tarjeta')) {
    return {
      type: 'expense' as const,
      category: 'Finanzas',
      subCategory: 'Pago de tarjeta',
      isFixed: false,
      confidence: 0.75,
      needsReview: true,
      canUseMerchantCategory: false,
    };
  }

  if (normalized.includes('transferencia') || normalized.includes('compensacion de fondos')) {
    return {
      type: 'transfer' as const,
      category: signedAmount < 0 ? 'Transferencias enviadas' : 'Transferencias recibidas',
      subCategory: 'Transferencia bancaria',
      isFixed: false,
      confidence: 0.65,
      needsReview: true,
      canUseMerchantCategory: false,
    };
  }

  return {
    type: signedAmount < 0 ? 'expense' as const : 'income' as const,
    category: signedAmount < 0 ? 'Sin categorizar' : 'Ingresos',
    subCategory: '',
    isFixed: false,
    confidence: 0.45,
    needsReview: true,
    canUseMerchantCategory: signedAmount < 0,
  };
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

function cleanMovementDescription(description: string) {
  return description.replace(/\s+/g, ' ').trim();
}

function stripPdfLineNoise(line: string) {
  const dateIndex = line.search(/\d{2}\/\d{2}\s+/);
  if (dateIndex > 0) return line.slice(dateIndex).trim();
  return line;
}

function parseArgentineMoney(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function buildIsoDate(year: number, datePart: string) {
  const [day, month] = datePart.split('/').map(Number);
  return new Date(year, month - 1, day, 12).toISOString();
}

function parseVisaDate(value: string, fallbackYear: number) {
  const match = /(\d{1,2})-([A-Za-zÁÉÍÓÚáéíóú]{3})-(\d{2})/.exec(value);
  if (!match) return undefined;
  const [, day, monthText, yearText] = match;
  const month = monthNumber(monthText);
  if (!month) return undefined;
  return buildIsoDate(resolveTwoDigitYear(yearText, fallbackYear), `${day.padStart(2, '0')}/${String(month).padStart(2, '0')}`);
}

function resolveTwoDigitYear(value: string, fallbackYear: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackYear;
  return parsed >= 70 ? 1900 + parsed : 2000 + parsed;
}

function inferYearFromFileName(fileName: string) {
  const match = /(\d{2})-\d{2}-\d{2}/.exec(fileName);
  if (!match) return null;
  return 2000 + Number(match[1]);
}

function inferYearFromStatementText(text: string) {
  const match = /(\d{2}\/\d{2}\/20\d{2}|20\d{2})/.exec(text);
  if (!match) return null;
  const yearMatch = /(20\d{2})/.exec(match[0]);
  return yearMatch ? Number(yearMatch[1]) : null;
}

function parseBbvaStatementHeader(text: string, year: number) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const accountLine = lines.find(line => /CA \$/.test(line) && /Saldo/i.test(line));
  const previousBalanceLine = lines.find(line => /^SALDO ANTERIOR\s+/i.test(line));
  const closingBalanceLine = lines.find(line => /^SALDO AL\s+/i.test(line));
  const totalsLine = lines.find(line => /^TOTAL MOVIMIENTOS\s+/i.test(line));

  return {
    accountLabel: accountLine?.replace(/\s+/g, ' '),
    currency: 'ARS',
    periodEnd: closingBalanceLine ? parsePeriodEnd(closingBalanceLine, year) : undefined,
    previousBalance: previousBalanceLine ? parseLastMoney(previousBalanceLine) : undefined,
    closingBalance: closingBalanceLine ? parseLastMoney(closingBalanceLine) : undefined,
    totalDebits: totalsLine ? parseTotalsMoney(totalsLine)[0] : undefined,
    totalCredits: totalsLine ? parseTotalsMoney(totalsLine)[1] : undefined,
  };
}

function buildStatementMetadata(
  header: ReturnType<typeof parseBbvaStatementHeader>,
  transactions: ImportedFinanceTransaction[],
): ImportedFinanceStatement {
  const signedMovementTotal = transactions.reduce((sum, transaction) => {
    if (typeof transaction.balanceDelta === 'number') return sum + transaction.balanceDelta;
    if (transaction.type === 'income') return sum + transaction.amount;
    return sum - transaction.amount;
  }, 0);

  const expectedClosingBalance =
    typeof header.previousBalance === 'number' ? roundMoney(header.previousBalance + signedMovementTotal) : undefined;
  const difference =
    typeof expectedClosingBalance === 'number' && typeof header.closingBalance === 'number'
      ? roundMoney(expectedClosingBalance - header.closingBalance)
      : undefined;

  return {
    ...header,
    transactionCount: transactions.length,
    balanceCheck:
      typeof expectedClosingBalance === 'number' && typeof difference === 'number'
        ? {
            expectedClosingBalance,
            difference,
            isBalanced: Math.abs(difference) < 0.02,
          }
        : undefined,
  };
}

export function buildTransactionFingerprint(transaction: Pick<ImportedFinanceTransaction, 'date' | 'description' | 'amount' | 'type' | 'balanceDelta'>) {
  const date = new Date(transaction.date);
  const dayKey = Number.isNaN(date.getTime()) ? String(transaction.date).slice(0, 10) : date.toISOString().slice(0, 10);
  const amountKey = Math.round(Number(transaction.amount || 0) * 100);
  const deltaKey = typeof transaction.balanceDelta === 'number' ? Math.round(transaction.balanceDelta * 100) : amountKey;
  return [
    dayKey,
    normalizeFingerprintText(transaction.description || ''),
    transaction.type || '',
    amountKey,
    deltaKey,
  ].join('|');
}

export function buildStatementFingerprint(source: string, statement: Pick<ImportedFinanceStatement, 'accountLabel' | 'periodEnd' | 'previousBalance' | 'closingBalance' | 'totalDebits' | 'totalCredits' | 'transactionCount'>) {
  return [
    source,
    normalizeFingerprintText(statement.accountLabel || ''),
    statement.periodEnd ? new Date(statement.periodEnd).toISOString().slice(0, 10) : '',
    Math.round(Number(statement.previousBalance || 0) * 100),
    Math.round(Number(statement.closingBalance || 0) * 100),
    Math.round(Number(statement.totalDebits || 0) * 100),
    Math.round(Number(statement.totalCredits || 0) * 100),
    statement.transactionCount || 0,
  ].join('|');
}

function parsePeriodEnd(line: string, year: number) {
  const match = /SALDO AL\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚÑ]+)/i.exec(line);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = monthNumber(match[2]);
  if (!month) return undefined;
  return buildIsoDate(year, `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`);
}

function parseLastMoney(line: string) {
  const matches = line.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g);
  return matches?.length ? parseArgentineMoney(matches[matches.length - 1]) : undefined;
}

function parseTotalsMoney(line: string) {
  const matches = line.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g) || [];
  return [matches[0] ? Math.abs(parseArgentineMoney(matches[0])) : undefined, matches[1] ? parseArgentineMoney(matches[1]) : undefined];
}

function monthNumber(value: string) {
  const normalized = normalizeText(value);
  const months: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    mar: 3,
    abril: 4,
    abr: 4,
    mayo: 5,
    may: 5,
    junio: 6,
    jun: 6,
    julio: 7,
    jul: 7,
    agosto: 8,
    ago: 8,
    septiembre: 9,
    sep: 9,
    octubre: 10,
    oct: 10,
    noviembre: 11,
    nov: 11,
    diciembre: 12,
    dic: 12,
    ene: 1,
    feb: 2,
  };
  return months[normalized];
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeLooseText(value: string) {
  return normalizeText(value)
    .replace(/\s+/g, ' ')
    .replace(/\bcr e dito\b/g, 'credito')
    .replace(/\bdescripci o n\b/g, 'descripcion')
    .replace(/\bd o lares\b/g, 'dolares')
    .replace(/\bp i nimo\b/g, 'minimo')
    .trim();
}

function normalizeFingerprintText(value: string) {
  return normalizeText(value)
    .replace(/\b(nro|numero|comprobante|compbte)\b/g, ' ')
    .replace(/[0-9]{5,}/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
