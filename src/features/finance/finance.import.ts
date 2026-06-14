import Papa from 'papaparse';
import { suggestMerchant } from './finance.merchants.ts';
import { classifyFinanceText } from './finance.taxonomy.ts';

export interface ImportedFinanceTransaction {
  amount: number;
  currency?: 'ARS' | 'USD' | string;
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
  counterpartyName?: string;
  counterpartyAccount?: string;
  counterpartyAlias?: string;
  transferDetail?: string;
  importSource?: string;
  importMode?: 'statement' | 'historical_learning';
  sourceAccountLabel?: string;
  sourceCategoryLabel?: string;
  paymentType?: string;
  tags?: string[];
  balanceDelta?: number;
  sourceLine?: string;
  debitCardDetailLine?: string;
  cardLast4?: string;
  voucherNumber?: string;
  installmentNumber?: number;
  installmentTotal?: number;
  installmentLabel?: string;
  transactionFingerprint?: string;
  statementFingerprint?: string;
}

export interface FinanceImportResult {
  source: 'bbva_caja_ahorro_ars' | 'bbva_visa' | 'generic_csv' | 'wallet_history' | 'unknown';
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
  totalDebitsUsd?: number;
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

interface BbvaDebitCardDetail {
  dateKey: string;
  amount: number;
  merchantName: string;
  merchantKey: string;
  cardLast4?: string;
  voucherNumber?: string;
  rawLine: string;
}

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

export function parseFinanceCsvText(text: string, fileName = ''): FinanceImportResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: header => header.trim(),
  });
  const warnings: string[] = [];

  if (parsed.errors.length > 0) {
    warnings.push(...parsed.errors.slice(0, 5).map(error => error.message));
  }

  const rows = (parsed.data || []).filter(row =>
    Object.values(row || {}).some(value => String(value || '').trim()),
  );

  if (rows.length === 0) {
    return {
      source: 'generic_csv',
      transactions: [],
      warnings: ['No encontre filas legibles en el CSV.'],
    };
  }

  const columns = Object.keys(rows[0] || {});
  if (isWalletCsv(columns)) {
    return parseWalletCsvRows(rows, fileName, warnings);
  }

  const dateColumn = findCsvColumn(columns, ['fecha', 'date', 'fecha movimiento', 'fecha operacion', 'fecha de operacion', 'fecha pago']);
  const descriptionColumn = findCsvColumn(columns, ['descripcion', 'descripción', 'concepto', 'detalle', 'movimiento', 'comercio', 'referencia']);
  const amountColumn = findCsvColumn(columns, ['importe', 'monto', 'total', 'amount', 'valor']);
  const debitColumn = findCsvColumn(columns, ['debito', 'débito', 'debe', 'egreso', 'cargo', 'cargos', 'consumo', 'consumos']);
  const creditColumn = findCsvColumn(columns, ['credito', 'crédito', 'haber', 'ingreso', 'abono', 'acredita', 'acreditacion']);
  const currencyColumn = findCsvColumn(columns, ['moneda', 'currency', 'divisa']);

  if (!dateColumn) warnings.push('No detecte una columna clara de fecha.');
  if (!descriptionColumn) warnings.push('No detecte una columna clara de descripcion/concepto.');
  if (!amountColumn && !debitColumn && !creditColumn) warnings.push('No detecte columnas claras de importe/debito/credito.');

  const transactions = rows
    .map((row, index) => parseCsvTransactionRow({
      row,
      index,
      fileName,
      dateColumn,
      descriptionColumn,
      amountColumn,
      debitColumn,
      creditColumn,
      currencyColumn,
    }))
    .filter(Boolean) as ImportedFinanceTransaction[];

  const statementFingerprint = buildStatementFingerprint('generic_csv', {
    accountLabel: fileName || 'CSV',
    periodEnd: transactions[0]?.date,
    previousBalance: 0,
    closingBalance: 0,
    totalDebits: transactions.filter(transaction => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0),
    totalCredits: transactions.filter(transaction => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0),
    transactionCount: transactions.length,
  });

  transactions.forEach(transaction => {
    transaction.statementFingerprint = statementFingerprint;
    transaction.transactionFingerprint = buildTransactionFingerprint(transaction);
  });

  return {
    source: 'generic_csv',
    transactions,
    statement: {
      accountLabel: fileName || 'CSV',
      currency: transactions[0]?.currency || 'ARS',
      transactionCount: transactions.length,
      statementFingerprint,
    },
    warnings,
  };
}

function isWalletCsv(columns: string[]) {
  const normalized = columns.map(normalizeCsvColumnName);
  return [
    'account',
    'category',
    'currency',
    'amount',
    'type',
    'payment type',
    'note',
    'date',
    'transfer',
    'payee',
    'labels',
  ].filter(column => normalized.includes(column)).length >= 7;
}

function parseWalletCsvRows(rows: Record<string, string>[], fileName: string, warnings: string[]): FinanceImportResult {
  const transactions = rows
    .map((row, index) => parseWalletTransactionRow(row, index, fileName))
    .filter(Boolean) as ImportedFinanceTransaction[];

  const statementFingerprint = buildStatementFingerprint('wallet_history', {
    accountLabel: fileName || 'Wallet history',
    periodEnd: transactions[0]?.date,
    previousBalance: 0,
    closingBalance: 0,
    totalDebits: transactions.filter(transaction => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0),
    totalCredits: transactions.filter(transaction => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0),
    transactionCount: transactions.length,
  });

  transactions.forEach(transaction => {
    transaction.statementFingerprint = statementFingerprint;
    transaction.transactionFingerprint = buildTransactionFingerprint(transaction);
  });

  return {
    source: 'wallet_history',
    transactions,
    statement: {
      accountLabel: 'Wallet history',
      currency: transactions[0]?.currency || 'ARS',
      transactionCount: transactions.length,
      statementFingerprint,
    },
    warnings,
  };
}

function parseWalletTransactionRow(row: Record<string, string>, index: number, fileName: string) {
  const walletAccount = repairImportedText(String(row.account || '').trim());
  const walletCategory = repairImportedText(String(row.category || '').trim());
  const note = repairImportedText(String(row.note || '').trim());
  const payee = repairImportedText(String(row.payee || '').trim());
  const labels = repairImportedText(String(row.labels || '').trim());
  const paymentType = repairImportedText(String(row.payment_type || row.paymentType || '').trim());
  const walletType = normalizeText(String(row.type || 'Expense'));
  const amount = Math.abs(Number(row.amount || 0));
  if (!amount) return null;

  const type = walletType.includes('income') ? 'income' as const : 'expense' as const;
  const currency = normalizeCsvCurrency(String(row.currency || ''), `${note} ${payee}`);
  const date = parseCsvDate(String(row.date || '')) || new Date();
  const description = cleanMovementDescription(note || payee || walletCategory || `Wallet ${index + 1}`);
  const classificationText = [description, payee, walletCategory, labels].filter(Boolean).join(' ');
  const merchant = suggestMerchant([payee, description].filter(Boolean).join(' '));
  const classification = classifyFinanceText(classificationText);
  const category = type === 'income' ? 'Ingresos' : (merchant.confidence >= 0.8 ? merchant.category : classification.suggestion.category);
  const subCategory = type === 'income' ? '' : (merchant.confidence >= 0.8 ? merchant.subCategory : classification.suggestion.subcategory);
  const confidence = Math.max(0.72, merchant.confidence, classification.suggestion.confidence);

  return {
    amount,
    currency,
    description,
    category,
    subCategory,
    type,
    date: date.toISOString(),
    isFixed: merchant.isLikelyRecurring,
    confidence,
    needsReview: true,
    merchantName: merchant.confidence >= 0.8 ? merchant.merchantName : (payee || undefined),
    merchantKey: merchant.confidence >= 0.8 ? merchant.merchantKey : buildWalletMerchantKey(payee || description),
    importSource: 'wallet_history',
    importMode: 'historical_learning',
    sourceAccountLabel: walletAccount,
    sourceCategoryLabel: walletCategory,
    paymentType,
    tags: ['wallet-history', ...splitWalletLabels(labels), walletCategory ? `wallet:${walletCategory}` : ''].filter(Boolean),
    balanceDelta: type === 'income' ? amount : -amount,
  } satisfies ImportedFinanceTransaction;
}

function parseBbvaVisa(text: string, fileName: string): Omit<FinanceImportResult, 'source'> {
  const year = inferYearFromFileName(fileName) || inferYearFromStatementText(text) || new Date().getFullYear();
  const statement = parseBbvaVisaStatementHeader(text, year);
  const warnings: string[] = [];
  const transactions = parseBbvaVisaTransactions(text, year);

  const totalExpenses = roundMoney(transactions.filter(transaction => transaction.type === 'expense' && (transaction.currency || 'ARS') === 'ARS').reduce((sum, transaction) => sum + transaction.amount, 0));
  const totalUsdExpenses = roundMoney(transactions.filter(transaction => transaction.type === 'expense' && transaction.currency === 'USD').reduce((sum, transaction) => sum + transaction.amount, 0));
  if (typeof statement.totalDebits === 'number' && Math.abs(roundMoney(totalExpenses - statement.totalDebits)) >= 0.02) {
    warnings.push(`Los consumos ARS detectados suman ${totalExpenses.toFixed(2)} y el resumen informa ${statement.totalDebits.toFixed(2)}.`);
  }
  if (typeof statement.totalDebitsUsd === 'number' && Math.abs(roundMoney(totalUsdExpenses - statement.totalDebitsUsd)) >= 0.02) {
    warnings.push(`Los consumos USD detectados suman ${totalUsdExpenses.toFixed(2)} y el resumen informa ${statement.totalDebitsUsd.toFixed(2)}.`);
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

    const amountInfo = parseVisaAmount(description, rawPesos, rawDollars);
    const amount = Math.abs(amountInfo.amount);
    if (!amount) continue;

    const type = amountInfo.amount < 0 ? 'income' as const : 'expense' as const;
    const merchant = suggestMerchant(description);
    const categorySuggestion = suggestVisaCategory(description, merchant);
    const installmentInfo = extractInstallmentInfo(description);

    transactions.push({
      amount,
      currency: amountInfo.currency,
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
      sourceLine: line,
      installmentNumber: installmentInfo?.number,
      installmentTotal: installmentInfo?.total,
      installmentLabel: installmentInfo?.label,
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
  const totalConsumptionAmounts = totalConsumptionLine ? parseTotalsMoney(totalConsumptionLine) : [];
  const totalDebits = totalConsumptionAmounts[0];
  const totalDebitsUsd = totalConsumptionAmounts[1];
  const previousBalanceLine = lines.find(line => /^SALDO ANTERIOR/i.test(line));

  return {
    accountLabel: accountLine.replace(/\s+/g, ' '),
    currency: 'ARS',
    periodEnd: parseVisaDate(closeDateLine, year),
    previousBalance: previousBalanceLine ? parseTotalsMoney(previousBalanceLine)[0] : undefined,
    closingBalance: currentBalance,
    totalDebits,
    totalDebitsUsd,
    transactionCount: 0,
  };
}

function parseVisaAmount(description: string, rawPesos: string, rawDollars?: string) {
  const hasForeignCurrencyMarker = /\b(USD|BRL|EUR|CLP|UYU|GBP)\b/i.test(description);
  const pesos = parseArgentineMoney(rawPesos);
  const dollars = rawDollars ? parseArgentineMoney(rawDollars) : 0;

  if (rawDollars) {
    return { amount: dollars, currency: 'USD' };
  }

  if (hasForeignCurrencyMarker) {
    return { amount: pesos, currency: 'USD' };
  }

  return { amount: pesos, currency: 'ARS' };
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
  const classification = classifyFinanceText(description);
  return {
    category: classification.suggestion.category,
    subCategory: classification.suggestion.subcategory,
    isLikelyRecurring: /osde|personal|flow|edenor|metrogas|aysa|seguro|spotify|netflix/i.test(normalized),
    confidence: classification.suggestion.confidence,
  };
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

function extractInstallmentInfo(description: string) {
  const text = String(description || '');
  const slashMatch = /(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s|$)/.exec(text);
  const cuotaMatch = /\b(?:CUOTA|CTA)\s*(\d{1,2})\s*(?:DE|\/)\s*(\d{1,2})\b/i.exec(text);
  const match = slashMatch || cuotaMatch;
  if (!match) return null;

  const number = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(number) || !Number.isFinite(total) || number < 1 || total < 2 || number > total) return null;

  return {
    number,
    total,
    label: `${number}/${total}`,
  };
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
  const debitCardDetails = parseBbvaDebitCardDetails(text, year);

  const transactions: ImportedFinanceTransaction[] = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(stripPdfLineNoise)
    .map(line => ({ line, match: BBVA_MOVEMENT_RE.exec(line) }))
    .filter((entry): entry is { line: string; match: RegExpExecArray } => Boolean(entry.match))
    .map(({ line, match }) => {
      const [, datePart, , rawDescription, rawAmount] = match;
      const amount = parseArgentineMoney(rawAmount);
      const description = cleanMovementDescription(rawDescription);
      const cardDetail = findMatchingDebitCardDetail(debitCardDetails, year, datePart, amount, description);
      const semanticDescription = cardDetail?.merchantName || description;
      const suggestion = suggestMovementClassification(semanticDescription, amount);
      const merchant = suggestMerchant(semanticDescription);
      const transferDetails = extractTransferDetails(description, suggestion.type);
      const merchantName = merchant.confidence >= 0.8 ? merchant.merchantName : cardDetail?.merchantName || '';
      const merchantKey = merchant.confidence >= 0.8 ? merchant.merchantKey : cardDetail?.merchantKey || '';

      return {
        amount: Math.abs(amount),
        description: cardDetail ? cardDetail.merchantName : description,
        category: merchant.confidence >= 0.8 && suggestion.canUseMerchantCategory ? merchant.category : suggestion.category,
        subCategory: merchant.confidence >= 0.8 && suggestion.canUseMerchantCategory ? merchant.subCategory : suggestion.subCategory,
        type: suggestion.type,
        date: buildIsoDate(year, datePart),
        isFixed: suggestion.isFixed || merchant.isLikelyRecurring,
        confidence: Math.max(suggestion.confidence, merchant.confidence, cardDetail ? 0.76 : 0),
        needsReview: suggestion.needsReview || (suggestion.canUseMerchantCategory && merchant.confidence < 0.8),
        merchantName,
        merchantKey,
        ...transferDetails,
        importSource: 'bbva_caja_ahorro_ars',
        sourceLine: line,
        debitCardDetailLine: cardDetail?.rawLine,
        cardLast4: cardDetail?.cardLast4,
        voucherNumber: cardDetail?.voucherNumber,
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

function parseBbvaDebitCardDetails(text: string, year: number): BbvaDebitCardDetail[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(stripPdfLineNoise)
    .map(line => parseBbvaDebitCardDetailLine(line, year))
    .filter((detail): detail is BbvaDebitCardDetail => Boolean(detail));
}

function parseBbvaDebitCardDetailLine(line: string, year: number): BbvaDebitCardDetail | null {
  const cleanedLine = cleanMovementDescription(line);
  if (!cleanedLine || !/\*{2,}/.test(cleanedLine)) return null;

  const dateMatch = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+/.exec(cleanedLine);
  if (!dateMatch) return null;

  const amountMatches = cleanedLine.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g) || [];
  const rawAmount = amountMatches[amountMatches.length - 1];
  if (!rawAmount) return null;

  const dateKey = buildDateKeyFromDatePart(dateMatch[1], year);
  const amount = Math.abs(parseArgentineMoney(rawAmount));
  if (!dateKey || !Number.isFinite(amount) || amount <= 0) return null;

  let body = cleanedLine
    .slice(dateMatch[0].length)
    .replace(rawAmount, ' ')
    .replace(/(?:U\$S|\$|USD|ARS)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cardLast4Match = /(?:\*{2,}\s*){1,4}(\d{4})/.exec(body);
  const cardLast4 = cardLast4Match?.[1];
  if (cardLast4Match) {
    body = body.replace(cardLast4Match[0], ' ').replace(/\s+/g, ' ').trim();
  }

  const voucherMatch = /(?:^|\s)(\d{4,10})(?:\s*)$/.exec(body);
  const voucherNumber = voucherMatch?.[1];
  if (voucherNumber) {
    body = body.slice(0, voucherMatch.index).trim();
  }

  const merchantName = body
    .replace(/\b(?:CUENTA|DEBITO|DÉBITO|CA|COMPRAS|VISA|TARJETA)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!merchantName || merchantName.length < 3) return null;

  return {
    dateKey,
    amount,
    merchantName,
    merchantKey: normalizeFingerprintText(merchantName).replace(/\s+/g, '-'),
    cardLast4,
    voucherNumber,
    rawLine: cleanedLine,
  };
}

function findMatchingDebitCardDetail(
  details: BbvaDebitCardDetail[],
  year: number,
  datePart: string,
  signedAmount: number,
  description: string,
) {
  const normalizedDescription = normalizeText(description);
  if (!normalizedDescription.includes('visa debito') && !normalizedDescription.includes('operacion en efectivo tarje')) return undefined;

  const dateKey = buildDateKeyFromDatePart(datePart, year);
  const amount = Math.abs(signedAmount);
  return details.find(detail =>
    detail.dateKey === dateKey &&
    Math.abs(detail.amount - amount) < 0.01
  );
}

function buildDateKeyFromDatePart(datePart: string, fallbackYear: number) {
  const parts = datePart.split('/').map(part => Number(part));
  const [day, month, rawYear] = parts;
  if (!day || !month) return '';
  const year = rawYear
    ? rawYear < 100 ? resolveTwoDigitYear(String(rawYear), fallbackYear) : rawYear
    : fallbackYear;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
      subCategory: 'Rendimientos',
      isFixed: false,
      confidence: 0.9,
      needsReview: false,
      canUseMerchantCategory: false,
    };
  }

  if (
    normalized.includes('cuenta visa') ||
    normalized.includes('cuenta master') ||
    normalized.includes('cuenta mastercard') ||
    normalized.includes('pago de servicios tarjeta') ||
    normalized.includes('pago tarjeta') ||
    normalized.includes('pago visa') ||
    normalized.includes('pago mastercard') ||
    normalized.includes('pago master')
  ) {
    return {
      type: 'transfer' as const,
      category: 'Movimientos neutros',
      subCategory: 'Pago tarjeta credito',
      isFixed: false,
      confidence: 0.9,
      needsReview: true,
      canUseMerchantCategory: false,
    };
  }

  if (normalized.includes('transferencia') || normalized.includes('compensacion de fondos')) {
    return {
      type: 'transfer' as const,
      category: 'Movimientos neutros',
      subCategory: 'Transferencia interna',
      isFixed: false,
      confidence: 0.65,
      needsReview: true,
      canUseMerchantCategory: false,
    };
  }

  return {
    type: signedAmount < 0 ? 'expense' as const : 'income' as const,
    category: signedAmount < 0 ? classifyFinanceText(description).suggestion.category : 'Ingresos',
    subCategory: signedAmount < 0 ? classifyFinanceText(description).suggestion.subcategory : '',
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

function findCsvColumn(columns: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeCsvColumnName);
  return columns.find(column => normalizedCandidates.includes(normalizeCsvColumnName(column))) ||
    columns.find(column => {
      const normalizedColumn = normalizeCsvColumnName(column);
      return normalizedCandidates.some(candidate => normalizedColumn.includes(candidate) || candidate.includes(normalizedColumn));
    });
}

function parseCsvTransactionRow(input: {
  row: Record<string, string>;
  index: number;
  fileName: string;
  dateColumn?: string;
  descriptionColumn?: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  currencyColumn?: string;
}) {
  const rawDescription = getCsvValue(input.row, input.descriptionColumn) || `Movimiento CSV ${input.index + 1}`;
  const description = cleanMovementDescription(rawDescription);
  const rawDate = getCsvValue(input.row, input.dateColumn);
  const date = parseCsvDate(rawDate) || new Date();
  const rawCurrency = getCsvValue(input.row, input.currencyColumn);
  const currency = normalizeCsvCurrency(rawCurrency, description);
  const amountInfo = parseCsvAmount(input.row, input.amountColumn, input.debitColumn, input.creditColumn);

  if (!amountInfo || !Number.isFinite(amountInfo.amount) || amountInfo.amount === 0) return null;

  const merchant = suggestMerchant(description);
  const classification = classifyFinanceText(description);
  const type = amountInfo.signedAmount > 0 ? 'income' as const : 'expense' as const;
  const category = type === 'income' ? 'Ingresos' : (merchant.confidence >= 0.8 ? merchant.category : classification.suggestion.category);
  const subCategory = type === 'income' ? '' : (merchant.confidence >= 0.8 ? merchant.subCategory : classification.suggestion.subcategory);
  const confidence = type === 'income' ? 0.75 : Math.max(merchant.confidence, classification.suggestion.confidence);

  return {
    amount: Math.abs(amountInfo.amount),
    currency,
    description,
    category,
    subCategory,
    type,
    date: date.toISOString(),
    isFixed: merchant.isLikelyRecurring,
    confidence,
    needsReview: confidence < 0.75 || !input.dateColumn || !input.descriptionColumn,
    merchantName: merchant.confidence >= 0.8 ? merchant.merchantName : undefined,
    merchantKey: merchant.confidence >= 0.8 ? merchant.merchantKey : undefined,
    importSource: 'generic_csv',
    balanceDelta: amountInfo.signedAmount,
  } satisfies ImportedFinanceTransaction;
}

function getCsvValue(row: Record<string, string>, column?: string) {
  if (!column) return '';
  return String(row[column] || '').trim();
}

function parseCsvAmount(
  row: Record<string, string>,
  amountColumn?: string,
  debitColumn?: string,
  creditColumn?: string,
) {
  const debit = parseCsvMoney(getCsvValue(row, debitColumn));
  const credit = parseCsvMoney(getCsvValue(row, creditColumn));
  if (typeof debit === 'number' && debit !== 0) {
    return { amount: Math.abs(debit), signedAmount: -Math.abs(debit) };
  }
  if (typeof credit === 'number' && credit !== 0) {
    return { amount: Math.abs(credit), signedAmount: Math.abs(credit) };
  }

  const amount = parseCsvMoney(getCsvValue(row, amountColumn));
  if (typeof amount !== 'number') return null;
  return { amount: Math.abs(amount), signedAmount: amount };
}

function parseCsvMoney(value: string) {
  const cleaned = String(value || '')
    .replace(/\s/g, '')
    .replace(/\$/g, '')
    .replace(/ARS|USD|EUR|US\$|U\$S/gi, '');
  if (!cleaned) return undefined;

  const isNegative = cleaned.startsWith('-') || /^\(.+\)$/.test(cleaned);
  const numeric = cleaned.replace(/[()]/g, '').replace(/^-/, '');
  const decimalSeparator = inferDecimalSeparator(numeric);
  const normalized = decimalSeparator === ','
    ? numeric.replace(/\./g, '').replace(',', '.')
    : numeric.replace(/,/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return isNegative ? -parsed : parsed;
}

function inferDecimalSeparator(value: string) {
  const commaIndex = value.lastIndexOf(',');
  const dotIndex = value.lastIndexOf('.');
  if (commaIndex > dotIndex) return ',';
  if (dotIndex > commaIndex) return '.';
  return ',';
}

function parseCsvDate(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return normalizeDateAtNoon(iso);

  const match = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(raw);
  if (match) {
    const [, day, month, yearText] = match;
    const year = yearText.length === 2 ? resolveTwoDigitYear(yearText, new Date().getFullYear()) : Number(yearText);
    const parsed = new Date(year, Number(month) - 1, Number(day), 12);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function normalizeDateAtNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function normalizeCsvCurrency(value: string, description: string) {
  const text = normalizeText(`${value || ''} ${description || ''}`).toUpperCase();
  if (text.includes('USD') || text.includes('U$S') || text.includes('US$')) return 'USD';
  if (text.includes('EUR')) return 'EUR';
  if (text.includes('BRL')) return 'BRL';
  if (text.includes('CLP')) return 'CLP';
  if (text.includes('UYU')) return 'UYU';
  return 'ARS';
}

function normalizeCsvColumnName(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitWalletLabels(value: string) {
  return String(value || '')
    .split(/[;,|]/)
    .map(label => label.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function buildWalletMerchantKey(value: string) {
  const normalized = normalizeFingerprintText(value || '');
  return normalized ? normalized.replace(/\s+/g, '-') : undefined;
}

function repairImportedText(value: string) {
  if (!/[ÃÂ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from([...value].map(char => char.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return value;
  }
}

function extractTransferDetails(description: string, type: ImportedFinanceTransaction['type']) {
  if (type !== 'transfer') return {};

  const counterpartyAccount = extractFirst(description, /\b(CBU|CVU)\s*[:\-]?\s*([0-9]{18,22})\b/i, 2);
  const counterpartyAlias = extractFirst(description, /\bALIAS\s*[:\-]?\s*([A-Z0-9._-]{4,40})\b/i, 1);
  const counterpartyName = extractCounterpartyName(description);

  return {
    counterpartyName,
    counterpartyAccount,
    counterpartyAlias,
    transferDetail: description,
  };
}

function extractFirst(value: string, pattern: RegExp, groupIndex = 1) {
  const match = pattern.exec(value);
  return match?.[groupIndex]?.trim();
}

function extractCounterpartyName(description: string) {
  const patterns = [
    /\b(?:DESTINATARIO|BENEFICIARIO|TITULAR|PARA)\s*[:\-]?\s+(.+?)(?:\s+\b(?:CBU|CVU|ALIAS|CUIT|CUIL)\b|$)/i,
    /\bTRANSF(?:ERENCIA)?\s+(?:A|PARA)\s+(.+?)(?:\s+\b(?:CBU|CVU|ALIAS|CUIT|CUIL)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const rawName = extractFirst(description, pattern);
    const name = cleanCounterpartyName(rawName || '');
    if (name) return name;
  }

  return undefined;
}

function cleanCounterpartyName(value: string) {
  const cleaned = value
    .replace(/\b\d{5,}\b/g, ' ')
    .replace(/\b(?:TRANSFERENCIA|TRANSF|CBU|CVU|ALIAS|CUIT|CUIL|NRO|NUMERO|COMPROBANTE)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned.length < 4 || cleaned.length > 80) return undefined;
  return cleaned;
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

export function buildTransactionFingerprint(transaction: Pick<ImportedFinanceTransaction, 'date' | 'description' | 'amount' | 'currency' | 'type' | 'balanceDelta'>) {
  const date = new Date(transaction.date);
  const dayKey = Number.isNaN(date.getTime()) ? String(transaction.date).slice(0, 10) : date.toISOString().slice(0, 10);
  const amountKey = Math.round(Number(transaction.amount || 0) * 100);
  const deltaKey = typeof transaction.balanceDelta === 'number' ? Math.round(transaction.balanceDelta * 100) : amountKey;
  return [
    dayKey,
    normalizeFingerprintText(transaction.description || ''),
    transaction.type || '',
    transaction.currency || '',
    amountKey,
    deltaKey,
  ].join('|');
}

export function buildStatementFingerprint(source: string, statement: Pick<ImportedFinanceStatement, 'accountLabel' | 'periodEnd' | 'previousBalance' | 'closingBalance' | 'totalDebits' | 'totalDebitsUsd' | 'totalCredits' | 'transactionCount'>) {
  return [
    source,
    normalizeFingerprintText(statement.accountLabel || ''),
    statement.periodEnd ? new Date(statement.periodEnd).toISOString().slice(0, 10) : '',
    Math.round(Number(statement.previousBalance || 0) * 100),
    Math.round(Number(statement.closingBalance || 0) * 100),
    Math.round(Number(statement.totalDebits || 0) * 100),
    Math.round(Number(statement.totalDebitsUsd || 0) * 100),
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
