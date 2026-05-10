import { suggestMerchant } from './finance.merchants';

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
}

export interface FinanceImportResult {
  source: 'bbva_caja_ahorro_ars' | 'unknown';
  transactions: ImportedFinanceTransaction[];
}

const BBVA_MOVEMENT_RE =
  /^(\d{2}\/\d{2})\s+(?:(\d{3})\s+)?(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})$/;

export function parseFinanceStatementText(text: string, fileName = ''): FinanceImportResult {
  const normalizedText = normalizeWhitespace(text);
  const isBbvaCajaAhorroArs =
    /Banco BBVA Argentina/i.test(normalizedText) &&
    /Movimientos en cuentas/i.test(normalizedText) &&
    /CA \$|Caja de Ahorro|Cuenta Sueldo/i.test(normalizedText);

  if (!isBbvaCajaAhorroArs) {
    return { source: 'unknown', transactions: [] };
  }

  return {
    source: 'bbva_caja_ahorro_ars',
    transactions: parseBbvaCajaAhorroArs(normalizedText, fileName),
  };
}

function parseBbvaCajaAhorroArs(text: string, fileName: string): ImportedFinanceTransaction[] {
  const year = inferYearFromFileName(fileName) || inferYearFromStatementText(text) || new Date().getFullYear();

  return text
    .split(/\r?\n/)
    .map(line => line.trim())
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
        needsReview: suggestion.needsReview || merchant.confidence < 0.8,
        merchantName: merchant.confidence >= 0.8 ? merchant.merchantName : '',
        merchantKey: merchant.confidence >= 0.8 ? merchant.merchantKey : '',
        importSource: 'bbva_caja_ahorro_ars',
      };
    })
    .filter(transaction => transaction.amount > 0);
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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
