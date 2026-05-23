import { format } from 'date-fns';
import type { HabitRecord } from '../habits/habit.types';

export type LuzActionType = 'create_finance_transaction' | 'create_journal_entry' | 'create_habit_checkin' | 'ask_follow_up';
export type LuzConfidence = 'high' | 'medium' | 'low';

export interface LuzFinanceDraft {
  amount: number;
  currency: string;
  type: 'expense' | 'income';
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  description: string;
  accountId?: string;
  accountName?: string;
  paymentMethod?: string;
  needsReview: boolean;
}

export interface LuzJournalDraft {
  content: string;
  categories: string[];
}

export interface LuzHabitCheckinDraft {
  habitId?: string;
  habitTitle: string;
  status: 'green' | 'yellow' | 'red';
  date: string;
  note: string;
  needsReview: boolean;
}

export interface LuzAction {
  id: string;
  type: LuzActionType;
  title: string;
  detail: string;
  confidence: LuzConfidence;
  finance?: LuzFinanceDraft;
  journal?: LuzJournalDraft;
  habitCheckin?: LuzHabitCheckinDraft;
  question?: string;
}

export interface LuzRouteResult {
  actions: LuzAction[];
  summary: string;
}

export interface LuzFinancialAccountOption {
  id: string;
  name: string;
  currency?: string;
  type?: string;
}

const MONEY_WORDS = ['gaste', 'gasto', 'pague', 'compre', 'transferi', 'cobre', 'ingreso', 'me pagaron', 'me depositaron'];
const INCOME_WORDS = ['cobre', 'ingreso', 'me pagaron', 'me depositaron', 'sueldo', 'honorarios'];
const NEGATIVE_HABIT_WORDS = ['no cumpli', 'falle', 'me comi las unas', 'me mordi las unas'];
const POSITIVE_HABIT_WORDS = ['cumpli', 'entrene', 'medite', 'lei', 'sali a correr', 'fui al gym'];
const PAYMENT_HINTS = ['con ', 'tarjeta', 'visa', 'master', 'mastercard', 'amex', 'mercado pago', 'mp', 'uala', 'brubank', 'galicia', 'santander', 'bbva', 'naranja', 'efectivo', 'debito', 'credito'];
const REFLECTIVE_JOURNAL_WORDS = [
  'me senti',
  'me siento',
  'me pasa',
  'me paso',
  'me tiene',
  'estoy',
  'conflict',
  'angust',
  'culpa',
  'duda',
  'pense',
  'pensando',
  'creo',
  'quiero',
  'necesito',
  'deberia',
  'me pase',
  'me arrepenti',
  'me gusto',
  'me encanto',
  'aprendi',
];

export function routeLuzMessage(rawMessage: string, habits: HabitRecord[] = [], accounts: LuzFinancialAccountOption[] = []): LuzRouteResult {
  const message = rawMessage.trim();
  const normalized = normalize(message);
  const actions: LuzAction[] = [];

  const finance = parseFinanceAction(message, normalized, accounts);
  if (finance) actions.push(finance);

  const habit = parseHabitAction(message, normalized, habits);
  if (habit) actions.push(habit);

  if (shouldCreateJournal(normalized, Boolean(finance), Boolean(habit))) {
    actions.push({
      id: createActionId('journal'),
      type: 'create_journal_entry',
      title: 'Guardar en Diario Mental',
      detail: 'Registrar el contexto completo para que Luz pueda detectar patrones mas adelante.',
      confidence: finance || habit ? 'medium' : 'high',
      journal: {
        content: message,
        categories: inferJournalCategories(normalized),
      },
    });
  }

  actions.push(...buildFollowUps(message, normalized, actions));

  if (actions.length === 0) {
    actions.push({
      id: createActionId('journal'),
      type: 'create_journal_entry',
      title: 'Guardar en Diario Mental',
      detail: 'No detecte una accion concreta, pero puedo guardar esto como entrada privada.',
      confidence: 'medium',
      journal: { content: message, categories: ['yo'] },
    });
  }

  return {
    actions,
    summary: summarizeActions(actions),
  };
}

function parseFinanceAction(message: string, normalized: string, accounts: LuzFinancialAccountOption[]): LuzAction | null {
  const amount = parseAmount(normalized);
  const looksLikeMoney = amount > 0 && (
    MONEY_WORDS.some(word => normalized.includes(normalize(word))) ||
    normalized.includes('pesos') ||
    normalized.includes('$') ||
    normalized.includes('usd')
  );

  if (!looksLikeMoney) return null;

  const type = INCOME_WORDS.some(word => normalized.includes(normalize(word))) ? 'income' : 'expense';
  const category = inferFinanceCategory(normalized);
  const currency = inferCurrency(normalized);
  const description = inferDescription(message, amount) || category;
  const payment = inferPayment(normalized, accounts);
  const needsReview = !payment.accountId;
  const paymentDetail = payment.accountName
    ? `Cuenta sugerida: ${payment.accountName}.`
    : payment.paymentMethod
      ? `Medio detectado: ${payment.paymentMethod}. Falta asociarlo a una cuenta.`
      : 'Falta confirmar cuenta o billetera.';

  return {
    id: createActionId('finance'),
    type: 'create_finance_transaction',
    title: type === 'income' ? 'Registrar ingreso' : 'Registrar gasto',
    detail: `${amount.toLocaleString()} ${currency} - ${category}. ${paymentDetail}`,
    confidence: payment.accountId ? 'high' : 'medium',
    finance: {
      amount,
      currency,
      type,
      category,
      subCategory: '',
      subSubCategory: '',
      description,
      accountId: payment.accountId,
      accountName: payment.accountName,
      paymentMethod: payment.paymentMethod,
      needsReview,
    },
  };
}

function parseHabitAction(message: string, normalized: string, habits: HabitRecord[]): LuzAction | null {
  const isNegative = NEGATIVE_HABIT_WORDS.some(word => normalized.includes(normalize(word)));
  const isPositive = POSITIVE_HABIT_WORDS.some(word => normalized.includes(normalize(word)));
  if (!isNegative && !isPositive) return null;

  const matchingHabit = findMatchingHabit(normalized, habits);
  const status = isNegative ? 'red' : 'green';
  const habitTitle = matchingHabit?.title || inferHabitTitle(normalized, status);

  return {
    id: createActionId('habit'),
    type: matchingHabit ? 'create_habit_checkin' : 'ask_follow_up',
    title: matchingHabit ? 'Marcar habito' : 'Completar habito detectado',
    detail: matchingHabit
      ? `${habitTitle}: ${status === 'red' ? 'no cumplido' : 'cumplido'} hoy.`
      : `Detecte un habito, pero no encontre cual deberia actualizar.`,
    confidence: matchingHabit ? 'medium' : 'low',
    habitCheckin: {
      habitId: matchingHabit?.id,
      habitTitle,
      status,
      date: format(new Date(), 'yyyy-MM-dd'),
      note: message,
      needsReview: !matchingHabit,
    },
    question: matchingHabit ? undefined : 'A que habito queres asociar esto?',
  };
}

function buildFollowUps(message: string, normalized: string, actions: LuzAction[]) {
  const followUps: LuzAction[] = [];
  const hasFinance = actions.some(action => action.type === 'create_finance_transaction');
  const hasCinema = normalized.includes('cine') || normalized.includes('pelicula');

  if (hasFinance) {
    const financeAction = actions.find(action => action.type === 'create_finance_transaction');
    if (financeAction?.finance?.needsReview) {
      followUps.push({
        id: createActionId('question'),
        type: 'ask_follow_up',
        title: 'Dato pendiente',
        detail: financeAction.finance.paymentMethod
          ? `Detecte ${financeAction.finance.paymentMethod}, pero necesito saber a que cuenta corresponde.`
          : 'Con que cuenta, tarjeta o billetera lo pagaste?',
        confidence: 'high',
        question: financeAction.finance.paymentMethod
          ? `A que cuenta de Finanzas asociamos ${financeAction.finance.paymentMethod}?`
          : 'Con que cuenta, tarjeta o billetera lo pagaste?',
      });
    }
  }

  if (hasCinema) {
    followUps.push({
      id: createActionId('question'),
      type: 'ask_follow_up',
      title: 'Reflexion opcional',
      detail: 'Te gusto la pelicula? Que puntaje le pondrias y que te quedo dando vueltas?',
      confidence: 'medium',
      question: 'Te gusto la pelicula? Que puntaje le pondrias y que te quedo dando vueltas?',
    });
  }

  return followUps.slice(0, 2);
}

function shouldCreateJournal(normalized: string, hasFinance: boolean, hasHabit: boolean) {
  if (!hasFinance && !hasHabit) return true;
  const hasReflection = includesAny(normalized, REFLECTIVE_JOURNAL_WORDS);
  const hasPersonalContext = includesAny(normalized, ['pareja', 'trabajo', 'vicky', 'familia', 'cine', 'pelicula', 'marca', 'experiencia', 'turista']);
  const isLongNarrative = normalized.length >= 180;
  return hasReflection || hasPersonalContext || isLongNarrative;
}

function inferJournalCategories(normalized: string) {
  const categories = new Set<string>(['yo']);
  if (includesAny(normalized, ['pareja', 'vicky', 'novia', 'novio'])) categories.add('pareja');
  if (includesAny(normalized, ['trabajo', 'laburo', 'jefe', 'cliente'])) categories.add('trabajo');
  if (includesAny(normalized, ['gaste', 'gasto', 'pague', 'compre', 'plata', 'finanzas', 'pesos', 'usd', 'eur', 'euro'])) categories.add('finanzas');
  if (includesAny(normalized, ['salud', 'gym', 'entrene', 'dormir', 'energia', 'unas'])) categories.add('salud');
  if (includesAny(normalized, ['cine', 'pelicula', 'salida', 'juego'])) categories.add('ocio');
  return Array.from(categories);
}

function findMatchingHabit(normalized: string, habits: HabitRecord[]) {
  const activeHabits = habits.filter(habit => habit.status === 'active');
  return activeHabits.find(habit => {
    const title = normalize(habit.title);
    if (title && normalized.includes(title)) return true;
    if (includesAny(normalized, ['unas']) && includesAny(title, ['unas'])) return true;
    if (includesAny(normalized, ['entrene', 'gym', 'correr']) && includesAny(title, ['entren', 'gym', 'correr'])) return true;
    if (normalized.includes('medite') && title.includes('medit')) return true;
    return false;
  });
}

function inferHabitTitle(normalized: string, status: 'green' | 'yellow' | 'red') {
  if (includesAny(normalized, ['unas'])) return 'No comerse las unas';
  if (includesAny(normalized, ['entrene', 'gym', 'correr'])) return 'Entrenamiento';
  if (normalized.includes('medite')) return 'Meditacion';
  return status === 'red' ? 'Habito no cumplido' : 'Habito cumplido';
}

function summarizeActions(actions: LuzAction[]) {
  const executable = actions.filter(action => action.type !== 'ask_follow_up');
  const questions = actions.filter(action => action.type === 'ask_follow_up');
  if (executable.length === 0 && questions.length > 0) return 'Necesito un dato mas antes de guardar.';
  if (executable.length === 1) return `Entendi 1 accion: ${executable[0].title}.`;
  return `Entendi ${executable.length} acciones y ${questions.length} pregunta(s) opcionales.`;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseAmount(normalized: string) {
  const compactMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(k|mil)\b/);
  if (compactMatch) return parseLocaleNumber(compactMatch[1]) * 1000;

  const moneyMatch = normalized.match(/(?:\$|ars|usd|pesos?|dolares?)?\s*(\d[\d.,]*)/);
  if (!moneyMatch) return 0;
  return parseLocaleNumber(moneyMatch[1]);
}

function parseLocaleNumber(value: string) {
  const cleaned = value.replace(/\s/g, '');
  if (cleaned.includes('.') && cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  if (cleaned.includes('.') && /^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, '')) || 0;
  return Number(cleaned.replace(',', '.')) || 0;
}

function inferFinanceCategory(normalized: string) {
  if (includesAny(normalized, ['ropa', 'zapatilla', 'zapatillas', 'zapatos', 'campera', 'pantalon', 'remera'])) return 'Ropa';
  if (includesAny(normalized, ['cine', 'netflix', 'spotify', 'teatro', 'salida'])) return 'Ocio';
  if (includesAny(normalized, ['pasaje', 'pasajes', 'vuelo', 'hotel', 'viaje'])) return 'Viajes';
  if (includesAny(normalized, ['super', 'mercado', 'comida', 'almuerzo', 'cena', 'delivery', 'restaurant'])) return 'Comida';
  if (includesAny(normalized, ['uber', 'cabify', 'taxi', 'nafta', 'subte', 'tren', 'bondi', 'colectivo'])) return 'Transporte';
  if (includesAny(normalized, ['alquiler', 'expensas', 'luz', 'gas', 'internet', 'telefono'])) return 'Hogar';
  if (includesAny(normalized, ['gym', 'medico', 'farmacia', 'salud', 'terapia'])) return 'Salud';
  if (includesAny(normalized, ['curso', 'libro', 'educacion', 'clase'])) return 'Educacion';
  if (includesAny(normalized, INCOME_WORDS.map(normalize))) return 'Ingresos';
  return 'Sin clasificar';
}

function inferPayment(normalized: string, accounts: LuzFinancialAccountOption[]) {
  const account = findBestPaymentAccount(normalized, accounts);

  if (account) {
    return {
      accountId: account.id,
      accountName: account.name,
      paymentMethod: account.name,
    };
  }

  const paymentMethod = inferPaymentMethodLabel(normalized);
  return { paymentMethod };
}

function inferCurrency(normalized: string) {
  if (normalized.includes('eur') || normalized.includes('euro')) return 'EUR';
  if (normalized.includes('usd') || normalized.includes('dolar') || normalized.includes('dolares')) return 'USD';
  return 'ARS';
}

function findBestPaymentAccount(normalized: string, accounts: LuzFinancialAccountOption[]) {
  const wantsVisa = normalized.includes('visa');
  const wantsMastercard = normalized.includes('mastercard') || normalized.includes('master') || /\bmc\b/.test(normalized);
  const wantsCreditCard = normalized.includes('tarjeta') || normalized.includes('credito') || wantsVisa || wantsMastercard;
  const bankHints = ['bbva', 'galicia', 'santander', 'brubank', 'uala', 'naranja', 'mercado pago'];

  const scored = accounts
    .map(account => {
      const accountName = normalize(account.name || '');
      const accountType = normalize(account.type || '');
      const accountText = `${accountName} ${accountType}`;
      let score = 0;

      if (wantsVisa && accountText.includes('visa')) score += 100;
      if (wantsMastercard && (accountText.includes('mastercard') || accountText.includes('master') || /\bmc\b/.test(accountText))) score += 100;
      if (wantsCreditCard && accountType.includes('credit_card')) score += 25;
      if (wantsCreditCard && !accountType.includes('credit_card')) score -= 40;

      for (const hint of bankHints) {
        if (normalized.includes(hint) && accountText.includes(hint)) score += 15;
      }

      if (accountName && normalized.includes(accountName)) score += 40;
      for (const part of accountName.split(/\s+/)) {
        if (part.length > 3 && normalized.includes(part)) score += 5;
      }

      return { account, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.account;
}

function inferPaymentMethodLabel(normalized: string) {
  if (!includesAny(normalized, PAYMENT_HINTS)) return undefined;
  if (normalized.includes('mercado pago') || normalized.includes(' mp')) return 'Mercado Pago';
  if (normalized.includes('visa')) return 'Visa';
  if (normalized.includes('mastercard') || normalized.includes('master')) return 'Mastercard';
  if (normalized.includes('amex')) return 'Amex';
  if (normalized.includes('uala')) return 'Uala';
  if (normalized.includes('brubank')) return 'Brubank';
  if (normalized.includes('galicia')) return 'Galicia';
  if (normalized.includes('santander')) return 'Santander';
  if (normalized.includes('bbva')) return 'BBVA';
  if (normalized.includes('naranja')) return 'Naranja';
  if (normalized.includes('efectivo')) return 'Efectivo';
  if (normalized.includes('debito')) return 'Tarjeta de debito';
  if (normalized.includes('credito') || normalized.includes('tarjeta')) return 'Tarjeta';
  return undefined;
}

function inferDescription(message: string, amount: number) {
  return message
    .replace(new RegExp(String(amount), 'i'), '')
    .replace(/\$|\bars\b|\busd\b|\bpesos?\b|\bdolares?\b/gi, '')
    .replace(/\b(gaste|gasto|pague|compre|cobre|ingreso)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, terms: string[]) {
  return terms.some(term => value.includes(term));
}

function createActionId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
