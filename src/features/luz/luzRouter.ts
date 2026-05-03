export type LuzRouteType = 'finance' | 'journal';

export interface LuzFinanceDraft {
  amount: number;
  currency: string;
  type: 'expense' | 'income';
  category: string;
  description: string;
}

export interface LuzRouteResult {
  type: LuzRouteType;
  confidence: 'high' | 'medium' | 'low';
  finance?: LuzFinanceDraft;
  journalContent?: string;
  summary: string;
}

const MONEY_WORDS = ['gaste', 'gasté', 'pague', 'pagué', 'compre', 'compré', 'transferi', 'transferí', 'cobre', 'cobré', 'ingreso', 'me pagaron'];
const INCOME_WORDS = ['cobre', 'cobré', 'ingreso', 'me pagaron', 'me depositaron', 'sueldo', 'honorarios'];

export function routeLuzMessage(rawMessage: string): LuzRouteResult {
  const message = rawMessage.trim();
  const normalized = normalize(message);
  const amount = parseAmount(normalized);
  const looksLikeMoney = amount > 0 && MONEY_WORDS.some(word => normalized.includes(normalize(word)));

  if (looksLikeMoney) {
    const type = INCOME_WORDS.some(word => normalized.includes(normalize(word))) ? 'income' : 'expense';
    const category = inferFinanceCategory(normalized);
    const description = inferDescription(message, amount) || category;

    return {
      type: 'finance',
      confidence: 'medium',
      finance: {
        amount,
        currency: normalized.includes('usd') || normalized.includes('dolar') || normalized.includes('dolares') ? 'USD' : 'ARS',
        type,
        category,
        description,
      },
      summary: `${type === 'income' ? 'Ingreso' : 'Gasto'} registrado: ${amount.toLocaleString()} ${normalized.includes('usd') ? 'USD' : 'ARS'} en ${category}.`,
    };
  }

  return {
    type: 'journal',
    confidence: 'medium',
    journalContent: message,
    summary: 'Entrada guardada en Diario Mental.',
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseAmount(normalized: string) {
  const compactMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(k|mil)\b/);
  if (compactMatch) {
    return parseLocaleNumber(compactMatch[1]) * 1000;
  }

  const moneyMatch = normalized.match(/(?:\$|ars|usd|pesos?|dolares?)?\s*(\d[\d.,]*)/);
  if (!moneyMatch) return 0;

  return parseLocaleNumber(moneyMatch[1]);
}

function parseLocaleNumber(value: string) {
  const cleaned = value.replace(/\s/g, '');
  if (cleaned.includes('.') && cleaned.includes(',')) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (cleaned.includes('.') && /^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, '')) || 0;
  }
  return Number(cleaned.replace(',', '.')) || 0;
}

function inferFinanceCategory(normalized: string) {
  if (includesAny(normalized, ['cine', 'netflix', 'spotify', 'teatro', 'salida'])) return 'Ocio';
  if (includesAny(normalized, ['super', 'mercado', 'comida', 'almuerzo', 'cena', 'delivery', 'restaurant'])) return 'Comida';
  if (includesAny(normalized, ['uber', 'cabify', 'taxi', 'nafta', 'subte', 'tren', 'bondi', 'colectivo'])) return 'Transporte';
  if (includesAny(normalized, ['alquiler', 'expensas', 'luz', 'gas', 'internet', 'telefono'])) return 'Hogar';
  if (includesAny(normalized, ['gym', 'medico', 'farmacia', 'salud', 'terapia'])) return 'Salud';
  if (includesAny(normalized, ['curso', 'libro', 'educacion', 'clase'])) return 'Educacion';
  if (includesAny(normalized, INCOME_WORDS.map(normalize))) return 'Ingresos';
  return 'Sin clasificar';
}

function inferDescription(message: string, amount: number) {
  return message
    .replace(new RegExp(String(amount), 'i'), '')
    .replace(/\$|\bars\b|\busd\b|\bpesos?\b|\bdolares?\b/gi, '')
    .replace(/\b(gaste|gasté|pague|pagué|compre|compré|cobre|cobré|ingreso)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, terms: string[]) {
  return terms.some(term => value.includes(term));
}
