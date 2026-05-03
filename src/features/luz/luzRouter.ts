import { format } from 'date-fns';
import type { HabitRecord } from '../habits/habit.types';

export type LuzActionType = 'create_finance_transaction' | 'create_journal_entry' | 'create_habit_checkin' | 'ask_follow_up';
export type LuzConfidence = 'high' | 'medium' | 'low';

export interface LuzFinanceDraft {
  amount: number;
  currency: string;
  type: 'expense' | 'income';
  category: string;
  description: string;
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

const MONEY_WORDS = ['gaste', 'gasto', 'pague', 'compre', 'transferi', 'cobre', 'ingreso', 'me pagaron', 'me depositaron'];
const INCOME_WORDS = ['cobre', 'ingreso', 'me pagaron', 'me depositaron', 'sueldo', 'honorarios'];
const NEGATIVE_HABIT_WORDS = ['no cumpli', 'falle', 'me comi las unas', 'me mordi las unas'];
const POSITIVE_HABIT_WORDS = ['cumpli', 'hice', 'entrene', 'medite', 'lei', 'sali a correr', 'fui al gym'];

export function routeLuzMessage(rawMessage: string, habits: HabitRecord[] = []): LuzRouteResult {
  const message = rawMessage.trim();
  const normalized = normalize(message);
  const actions: LuzAction[] = [];

  const finance = parseFinanceAction(message, normalized);
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

function parseFinanceAction(message: string, normalized: string): LuzAction | null {
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
  const currency = normalized.includes('usd') || normalized.includes('dolar') || normalized.includes('dolares') ? 'USD' : 'ARS';
  const description = inferDescription(message, amount) || category;

  return {
    id: createActionId('finance'),
    type: 'create_finance_transaction',
    title: type === 'income' ? 'Registrar ingreso' : 'Registrar gasto',
    detail: `${amount.toLocaleString()} ${currency} - ${category}. Falta confirmar cuenta o billetera.`,
    confidence: 'medium',
    finance: {
      amount,
      currency,
      type,
      category,
      description,
      needsReview: true,
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
    followUps.push({
      id: createActionId('question'),
      type: 'ask_follow_up',
      title: 'Dato pendiente',
      detail: 'Con que cuenta, tarjeta o billetera lo pagaste?',
      confidence: 'high',
      question: 'Con que cuenta, tarjeta o billetera lo pagaste?',
    });
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
  return includesAny(normalized, ['me senti', 'me siento', 'pense', 'pensando', 'me gusto', 'me encanto', 'con ', 'pareja', 'trabajo', 'vicky', 'familia', 'cine', 'pelicula']);
}

function inferJournalCategories(normalized: string) {
  const categories = new Set<string>(['yo']);
  if (includesAny(normalized, ['pareja', 'vicky', 'novia', 'novio'])) categories.add('pareja');
  if (includesAny(normalized, ['trabajo', 'laburo', 'jefe', 'cliente'])) categories.add('trabajo');
  if (includesAny(normalized, ['gaste', 'pague', 'plata', 'finanzas', 'pesos', 'usd'])) categories.add('finanzas');
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
