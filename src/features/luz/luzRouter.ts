import { format } from 'date-fns';
import type { HabitRecord } from '../habits/habit.types';
import { classifyFinanceText } from '../finance/finance.taxonomy';
import type { NeutralType, TransactionKind } from '../finance/finance.types';
import type { WishlistHorizon, WishlistItemType } from '../wishlist/wishlist.types';

export type UniversalCaptureIntent = 'journal_entry' | 'financial_transaction' | 'wishlist_item' | 'goal' | 'habit' | 'calendar_event' | 'unknown';
export type LuzActionType =
  | 'create_finance_transaction'
  | 'create_journal_entry'
  | 'create_habit_checkin'
  | 'create_wishlist_item'
  | 'create_goal'
  | 'create_habit'
  | 'create_calendar_event'
  | 'ask_follow_up';
export type LuzConfidence = 'high' | 'medium' | 'low';

export interface LuzFinanceDraft {
  amount: number;
  currency: string;
  type: TransactionKind;
  neutralType?: NeutralType;
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

export interface LuzHabitDraft {
  title: string;
  description: string;
  startDate: string;
  linkedGoalIds: string[];
  needsReview: boolean;
}

export interface LuzGoalDraft {
  title: string;
  description: string;
  year: number;
  categories: string[];
  needsReview: boolean;
}

export interface LuzCalendarDraft {
  title: string;
  date?: string;
  durationMinutes?: number;
  category: string;
  needsReview: boolean;
}

export interface LuzWishlistDraft {
  title: string;
  estimatedPrice: number;
  currency: string;
  reason: string;
  category: string;
  itemType: WishlistItemType;
  horizon: WishlistHorizon;
  visibility: 'private' | 'shared_with_partner' | 'household_shared';
  owner: string;
  needsReview: boolean;
}

export interface LuzAction {
  id: string;
  type: LuzActionType;
  intent: UniversalCaptureIntent;
  title: string;
  detail: string;
  confidence: LuzConfidence;
  finance?: LuzFinanceDraft;
  journal?: LuzJournalDraft;
  habitCheckin?: LuzHabitCheckinDraft;
  habit?: LuzHabitDraft;
  goal?: LuzGoalDraft;
  calendar?: LuzCalendarDraft;
  wishlist?: LuzWishlistDraft;
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

const MONEY_WORDS = ['gaste', 'gasto', 'pague', 'compre', 'costo', 'salio', 'transferi', 'cobre', 'ingreso', 'me pagaron', 'me depositaron'];
const INCOME_WORDS = ['cobre', 'ingreso', 'me pagaron', 'me depositaron', 'sueldo', 'honorarios'];
const NEGATIVE_HABIT_WORDS = ['no cumpli', 'falle', 'me comi las unas', 'me mordi las unas'];
const POSITIVE_HABIT_WORDS = ['cumpli', 'entrene', 'medite', 'lei', 'sali a correr', 'fui al gym'];
const PAYMENT_HINTS = ['con ', 'tarjeta', 'visa', 'master', 'mastercard', 'amex', 'mercado pago', 'mp', 'uala', 'brubank', 'galicia', 'santander', 'bbva', 'naranja', 'efectivo', 'debito', 'credito'];
const WISHLIST_INTENT_WORDS = ['quiero comprar', 'me gustaria comprar', 'estoy pensando en comprar', 'tengo ganas de comprar', 'me quiero comprar', 'wishlist', 'lista de deseos'];
const BIG_WISHLIST_WORDS = ['casa', 'departamento', 'depto', 'terreno', 'auto', 'camioneta', 'mudanza', 'negocio', 'local', 'inversion', 'invertir'];
const GOAL_INTENT_WORDS = ['este ano quiero', 'mi objetivo', 'mi meta', 'quiero lograr', 'quiero estar', 'para este ano', 'objetivo anual'];
const HABIT_CREATION_WORDS = ['quiero empezar a', 'quiero arrancar', 'me gustaria empezar', 'necesito empezar', 'habito de', 'crear habito'];
const CALENDAR_INTENT_WORDS = ['agendame', 'agenda', 'calendario', 'bloqueame', 'reservame', 'recordame'];
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

  const financeActions = parseFinanceActions(message, normalized, accounts);
  actions.push(...financeActions);

  const wishlist = parseWishlistAction(message, normalized);
  if (wishlist) actions.push(wishlist);

  const goal = parseGoalAction(message, normalized);
  if (goal) actions.push(goal);

  const habitCreation = parseHabitCreationAction(message, normalized);
  if (habitCreation) actions.push(habitCreation);

  const calendar = parseCalendarAction(message, normalized);
  if (calendar) actions.push(calendar);

  const habit = parseHabitAction(message, normalized, habits);
  if (habit) actions.push(habit);

  const hasStructuredAction = financeActions.length > 0 || Boolean(wishlist) || Boolean(goal) || Boolean(habitCreation) || Boolean(calendar);
  if (shouldCreateJournal(normalized, hasStructuredAction, Boolean(habit))) {
    actions.push({
      id: createActionId('journal'),
      type: 'create_journal_entry',
      intent: 'journal_entry',
      title: 'Guardar en Diario Mental',
      detail: 'Registrar el contexto completo para que Luz pueda detectar patrones mas adelante.',
      confidence: financeActions.length > 0 || habit ? 'medium' : 'high',
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
      intent: 'journal_entry',
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

function parseWishlistAction(message: string, normalized: string): LuzAction | null {
  const hasWishlistIntent = includesAny(normalized, WISHLIST_INTENT_WORDS);
  if (!hasWishlistIntent) return null;

  const moneyMentions = parseMoneyMentions(message);
  const firstMoney = selectPrimaryMoneyMention(moneyMentions);
  const title = inferWishlistTitle(message, normalized, firstMoney?.index) || 'Item para evaluar';
  const category = inferWishlistCategory(normalized);
  const currency = firstMoney?.currency || inferCurrency(normalized);
  const itemType = inferWishlistItemType(normalized, firstMoney?.amount || 0, currency);
  const horizon = itemType === 'big_goal' || itemType === 'asset' ? 'long' : 'open';
  const visibility = includesAny(normalized, ['vicky', 'ambos', 'casa', 'pareja', 'living', 'hogar', 'depto', 'departamento']) ? 'shared_with_partner' : 'private';
  const owner = visibility === 'private' ? 'agustin' : 'shared';

  return {
    id: createActionId('wishlist'),
    type: 'create_wishlist_item',
    intent: 'wishlist_item',
    title: 'Agregar a Wishlist',
    detail: `${title}${firstMoney ? ` - ${firstMoney.amount.toLocaleString()} ${firstMoney.currency || inferCurrency(normalized)}` : ''}. ${itemType === 'big_goal' || itemType === 'asset' ? 'Lo marco como objetivo grande para mirarlo contra ingresos, gastos y plan.' : 'Queda al final del ranking para priorizar despues.'}`,
    confidence: title === 'Item para evaluar' ? 'low' : 'medium',
    wishlist: {
      title,
      estimatedPrice: firstMoney?.amount || 0,
      currency,
      reason: message,
      category,
      itemType,
      horizon,
      visibility,
      owner,
      needsReview: !firstMoney,
    },
  };
}

function parseFinanceActions(message: string, normalized: string, accounts: LuzFinancialAccountOption[]): LuzAction[] {
  const moneyMentions = parseMoneyMentions(message);
  const isFuturePurchaseIntent = includesAny(normalized, WISHLIST_INTENT_WORDS) &&
    !includesAny(normalized, ['gaste', 'gasto', 'pague', 'pago', 'compre', 'costo', 'salio', 'transferi', 'cobre', 'ingreso', 'me pagaron', 'me depositaron']);
  if (isFuturePurchaseIntent) return [];

  const looksLikeMoney = moneyMentions.length > 0 && (
    MONEY_WORDS.some(word => normalized.includes(normalize(word))) ||
    normalized.includes('pesos') ||
    normalized.includes('$') ||
    normalized.includes('usd') ||
    normalized.includes('eur') ||
    normalized.includes('euro')
  );

  if (!looksLikeMoney) return [];

  return moneyMentions.map((mention, index) => {
    const context = getMoneyMentionContext(message, mention.index);
    const normalizedContext = normalize(context);
    const classification = classifyFinanceText(context || message);
    const type = classification.suggestion.kind || (INCOME_WORDS.some(word => normalized.includes(normalize(word))) ? 'income' : 'expense');
    const category = classification.suggestion.category;
    const description = inferDescription(context || message, mention.amount) || category;
    const currency = mention.currency || inferCurrency(normalizedContext || normalized);
    const payment = inferPayment(normalized, accounts, currency);
    const needsReview = !payment.accountId;
    const paymentDetail = payment.accountName
      ? `Cuenta sugerida: ${payment.accountName}.`
      : payment.paymentMethod
        ? `Medio detectado: ${payment.paymentMethod}. Falta asociarlo a una cuenta.`
        : 'Falta confirmar cuenta o billetera.';

    return {
      id: createActionId(`finance-${index}`),
      type: 'create_finance_transaction',
      intent: 'financial_transaction',
      title: type === 'income' ? 'Registrar ingreso' : 'Registrar gasto',
      detail: `${mention.amount.toLocaleString()} ${currency} - ${category} / ${classification.suggestion.subcategory}. ${paymentDetail}`,
      confidence: payment.accountId ? 'high' : 'medium',
      finance: {
        amount: mention.amount,
        currency,
        type,
        neutralType: classification.suggestion.neutralType,
        category,
        subCategory: classification.suggestion.subcategory,
        subSubCategory: '',
        description,
        accountId: payment.accountId,
        accountName: payment.accountName,
        paymentMethod: payment.paymentMethod,
        needsReview,
      },
    };
  });
}

function parseGoalAction(message: string, normalized: string): LuzAction | null {
  const hasGoalIntent = includesAny(normalized, GOAL_INTENT_WORDS);
  if (!hasGoalIntent || includesAny(normalized, WISHLIST_INTENT_WORDS)) return null;

  const title = inferGoalTitle(message, normalized);
  const categories = inferGoalCategories(normalized);
  return {
    id: createActionId('goal'),
    type: 'create_goal',
    intent: 'goal',
    title: 'Crear objetivo',
    detail: `${title}. Queda como objetivo anual para conectar despues con habitos, calendario, finanzas y Wishlist.`,
    confidence: title ? 'medium' : 'low',
    goal: {
      title: title || 'Objetivo para definir',
      description: message,
      year: new Date().getFullYear(),
      categories,
      needsReview: !title,
    },
  };
}

function parseHabitCreationAction(message: string, normalized: string): LuzAction | null {
  const hasHabitIntent = includesAny(normalized, HABIT_CREATION_WORDS);
  if (!hasHabitIntent) return null;

  const title = inferNewHabitTitle(message, normalized);
  return {
    id: createActionId('habit-new'),
    type: 'create_habit',
    intent: 'habit',
    title: 'Crear habito',
    detail: `${title}. Lo dejo como habito activo para empezar a medirlo.`,
    confidence: title ? 'medium' : 'low',
    habit: {
      title: title || 'Habito para definir',
      description: message,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      linkedGoalIds: [],
      needsReview: !title,
    },
  };
}

function parseCalendarAction(message: string, normalized: string): LuzAction | null {
  if (!includesAny(normalized, CALENDAR_INTENT_WORDS)) return null;
  return {
    id: createActionId('calendar'),
    type: 'create_calendar_event',
    intent: 'calendar_event',
    title: 'Preparar evento',
    detail: 'Detecte algo para calendario. Por ahora queda como borrador hasta integrar Google Calendar con permisos reales.',
    confidence: 'low',
    calendar: {
      title: inferCalendarTitle(message),
      category: inferCalendarCategory(normalized),
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
    intent: 'habit',
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
        intent: 'unknown',
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
      intent: 'journal_entry',
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
  const reflectionTerms = hasFinance || hasHabit
    ? REFLECTIVE_JOURNAL_WORDS.filter(term => !['quiero', 'necesito', 'deberia'].includes(term))
    : REFLECTIVE_JOURNAL_WORDS;
  const hasReflection = includesAny(normalized, reflectionTerms);
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

function inferNewHabitTitle(message: string, normalized: string) {
  if (includesAny(normalized, ['entrenar', 'gym', 'correr'])) return 'Entrenar';
  if (includesAny(normalized, ['meditar', 'meditacion'])) return 'Meditar';
  if (includesAny(normalized, ['leer', 'lectura'])) return 'Leer';
  if (includesAny(normalized, ['dormir', 'descansar'])) return 'Dormir mejor';
  const intent = HABIT_CREATION_WORDS.find(word => normalized.includes(normalize(word)));
  if (!intent) return '';
  const normalizedIndex = normalized.indexOf(normalize(intent));
  return message
    .slice(normalizedIndex + intent.length)
    .replace(/\b(que|un|una|el|la|los|las|de|para|por|con|me|a)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,.]$/g, '')
    .slice(0, 80);
}

function inferGoalTitle(message: string, normalized: string) {
  if (includesAny(normalized, ['mejor estado fisico', 'estar en forma', 'salud'])) return 'Estar en mi mejor estado fisico';
  if (includesAny(normalized, ['orden financiero', 'finanzas', 'ahorrar'])) return 'Ordenar mis finanzas';
  const intent = GOAL_INTENT_WORDS.find(word => normalized.includes(word));
  if (!intent) return message.replace(/[,.]$/g, '').slice(0, 100);
  const normalizedIndex = normalized.indexOf(intent);
  return message
    .slice(normalizedIndex)
    .replace(/\b(este año quiero|este ano quiero|mi objetivo es|mi meta es|quiero lograr|quiero estar|para este año|para este ano|objetivo anual)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,.]$/g, '')
    .slice(0, 100);
}

function inferGoalCategories(normalized: string) {
  const categories = new Set<string>();
  if (includesAny(normalized, ['salud', 'fisico', 'entrenar', 'gym', 'dormir'])) categories.add('Salud');
  if (includesAny(normalized, ['finanzas', 'plata', 'ahorrar', 'inversion', 'casa'])) categories.add('Finanzas');
  if (includesAny(normalized, ['trabajo', 'empresa', 'equipo', 'comercial'])) categories.add('Trabajo');
  if (includesAny(normalized, ['pareja', 'vicky', 'familia'])) categories.add('Vinculos');
  if (includesAny(normalized, ['viaje', 'aventura'])) categories.add('Aventura');
  return categories.size ? Array.from(categories) : ['Personal'];
}

function inferCalendarTitle(message: string) {
  return message
    .replace(/\b(agendame|agenda|calendario|bloqueame|reservame|recordame)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,.]$/g, '')
    .slice(0, 100) || 'Evento para definir';
}

function inferCalendarCategory(normalized: string) {
  if (includesAny(normalized, ['entrenar', 'gym', 'medico', 'salud'])) return 'Salud';
  if (includesAny(normalized, ['finanzas', 'banco', 'resumen', 'plata'])) return 'Finanzas';
  if (includesAny(normalized, ['trabajo', 'reunion', 'cliente'])) return 'Trabajo';
  if (includesAny(normalized, ['vicky', 'pareja', 'familia'])) return 'Vinculos';
  return 'Personal';
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

function parseMoneyMentions(message: string) {
  const mentions: Array<{ amount: number; currency?: string; index: number }> = [];
  const patterns = [
    /(?:\$|ars|usd|eur|€)\s*(\d+(?:[.,]\d+)?)\s*(k|mil)?/gi,
    /(\d+(?:[.,]\d+)?)\s*(k|mil)?\s*(pesos?|ars|usd|dolares?|eur|euros?|€)\b/gi,
    /\b(\d[\d.,]*)\s*(k|mil)?\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of message.matchAll(pattern)) {
      const rawAmount = match[1];
      const multiplier = match[2] || '';
      const currencyText = match[3] || match[0] || '';
      const amount = parseLocaleNumber(rawAmount) * (normalize(multiplier).includes('mil') || normalize(multiplier) === 'k' ? 1000 : 1);
      if (!amount) continue;
      mentions.push({
        amount,
        currency: inferCurrency(normalize(currencyText)),
        index: match.index || 0,
      });
    }
  }

  const unique = new Map<string, { amount: number; currency?: string; index: number }>();
  mentions.forEach(mention => {
    const key = `${mention.index}-${mention.amount}`;
    const existing = unique.get(key);
    if (!existing || (!existing.currency && mention.currency)) unique.set(key, mention);
  });
  return Array.from(unique.values()).sort((a, b) => a.index - b.index).slice(0, 6);
}

function selectPrimaryMoneyMention(mentions: Array<{ amount: number; currency?: string; index: number }>) {
  if (mentions.length <= 1) return mentions[0];
  return [...mentions].sort((a, b) => b.amount - a.amount)[0];
}

function getMoneyMentionContext(message: string, index: number) {
  const start = findPreviousContextBreak(message, index);
  const end = findNextContextBreak(message, index + 1);
  return message.slice(start > 0 ? start + 1 : 0, end).trim();
}

function findPreviousContextBreak(message: string, index: number) {
  for (let position = index; position >= 0; position -= 1) {
    if (isContextBreak(message, position)) return position;
  }
  return 0;
}

function findNextContextBreak(message: string, index: number) {
  for (let position = index; position < message.length; position += 1) {
    if (isContextBreak(message, position)) return position;
  }
  return message.length;
}

function isContextBreak(message: string, position: number) {
  const char = message[position];
  if (char === ',' || char === ';') return true;
  if (char !== '.') return false;
  return !/\d/.test(message[position - 1] || '') || !/\d/.test(message[position + 1] || '');
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

function inferWishlistTitle(message: string, normalized: string, moneyIndex?: number) {
  const intent = WISHLIST_INTENT_WORDS.find(word => normalized.includes(normalize(word)));
  if (!intent) return '';

  const normalizedIntent = normalize(intent);
  const normalizedIndex = normalized.indexOf(normalizedIntent);
  const rawAfterIntent = normalizedIndex >= 0 ? message.slice(normalizedIndex + intent.length) : message;
  const beforePrice = typeof moneyIndex === 'number' && moneyIndex > 0
    ? message.slice(normalizedIndex + intent.length, moneyIndex)
    : rawAfterIntent;

  return beforePrice
    .replace(/\b(que|un|una|unos|unas|el|la|los|las|de|para|por|con|me|a)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,.]$/g, '')
    .slice(0, 80);
}

function inferWishlistCategory(normalized: string) {
  if (includesAny(normalized, ['zapatilla', 'zapatillas', 'ropa', 'campera', 'zapato'])) return 'Ropa';
  if (includesAny(normalized, ['tv', 'televisor', 'samsung', 'notebook', 'celular', 'camara', 'iphone', 'monitor', 'teclado'])) return 'Tecnologia';
  if (includesAny(normalized, ['casa', 'departamento', 'depto', 'terreno', 'auto', 'camioneta', 'inversion', 'invertir'])) return 'Patrimonio';
  if (includesAny(normalized, ['sillon', 'mesa', 'silla', 'escritorio', 'living', 'hogar'])) return 'Casa';
  if (includesAny(normalized, ['viaje', 'hotel', 'pasaje', 'vuelo'])) return 'Viajes';
  if (includesAny(normalized, ['golf', 'padel', 'futbol', 'deporte', 'bicicleta'])) return 'Deporte';
  return 'Otros';
}

function inferWishlistItemType(normalized: string, amount: number, currency: string): WishlistItemType {
  if (includesAny(normalized, ['inversion', 'invertir', 'terreno'])) return 'asset';
  const highAmount = currency === 'USD' || currency === 'EUR' ? amount >= 10000 : amount >= 5000000;
  if (includesAny(normalized, BIG_WISHLIST_WORDS) || highAmount) return 'big_goal';
  if (includesAny(normalized, ['viaje', 'hotel', 'pasaje', 'vuelo', 'experiencia', 'concierto', 'recital'])) return 'experience';
  return 'purchase';
}

function inferPayment(normalized: string, accounts: LuzFinancialAccountOption[], currency = 'ARS') {
  const account = findBestPaymentAccount(normalized, accounts, currency);

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

function findBestPaymentAccount(normalized: string, accounts: LuzFinancialAccountOption[], currency = 'ARS') {
  const wantsVisa = normalized.includes('visa');
  const wantsMastercard = normalized.includes('mastercard') || normalized.includes('master') || /\bmc\b/.test(normalized);
  const wantsCash = normalized.includes('efectivo');
  const wantsCreditCard = normalized.includes('tarjeta') || normalized.includes('credito') || wantsVisa || wantsMastercard;
  const bankHints = ['bbva', 'galicia', 'santander', 'brubank', 'uala', 'naranja', 'mercado pago'];

  const scored = accounts
    .map(account => {
      const accountName = normalize(account.name || '');
      const accountType = normalize(account.type || '');
      const accountCurrency = normalize(account.currency || '');
      const accountText = `${accountName} ${accountType}`;
      let score = 0;

      if (currency && accountCurrency && accountCurrency !== normalize(currency)) score -= 20;
      if (wantsCash && accountType.includes('cash')) score += 90;
      if (wantsCash && accountName.includes('efectivo')) score += 60;
      if (wantsCash && !accountType.includes('cash') && !accountName.includes('efectivo')) score -= 35;

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
