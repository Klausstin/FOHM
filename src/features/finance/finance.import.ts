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
}

export interface FinanceImportResult {
  source: 'bbva_caja_ahorro_ars' | 'unknown';
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
}

const BBVA_MOVEMENT_RE =
  /^(\d{2}\/\d{2})\s+(?:(\d{3})\s+)?(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})$/;

export function parseFinanceStatementText(text: string, fileName = ''): FinanceImportResult {
  const normalizedText = normalizeWhitespace(text);
  const isBbvaCajaAhorroArs =
    (/Movimientos en cuentas/i.test(normalizedText) || /FECHA\s+ORIGEN\s+CONCEPTO/i.test(normalizedText)) &&
    /SALDO ANTERIOR/i.test(normalizedText) &&
    /TOTAL MOVIMIENTOS/i.test(normalizedText) &&
    /CA \$|Caja de Ahorro|Cuenta Sueldo|Banco BBVA Argentina/i.test(normalizedText);

  if (!isBbvaCajaAhorroArs) {
    return { source: 'unknown', transactions: [] };
  }

  return {
    source: 'bbva_caja_ahorro_ars',
    ...parseBbvaCajaAhorroArs(normalizedText, fileName),
  };
}

function parseBbvaCajaAhorroArs(text: string, fileName: string): Omit<FinanceImportResult, 'source'> {
  const year = inferYearFromFileName(fileName) || inferYearFromStatementText(text) || new Date().getFullYear();
  const statementHeader = parseBbvaStatementHeader(text, year);
  const warnings: string[] = [];

  const transactions = text
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
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
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
