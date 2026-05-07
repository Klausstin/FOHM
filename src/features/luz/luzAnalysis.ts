export type LuzSourceType = 'journal' | 'finance' | 'habit' | 'goal';

export interface LuzMemoryRecord {
  id: string;
  type: LuzSourceType;
  title: string;
  body: string;
  date?: Date | null;
  meta?: string;
}

export interface LuzAnswer {
  summary: string;
  bullets: string[];
  sources: LuzMemoryRecord[];
  confidence: 'low' | 'medium' | 'high';
}

const STOPWORDS = new Set([
  'a', 'al', 'algo', 'como', 'con', 'cuando', 'cuantas', 'cuantos', 'de', 'del', 'el', 'en',
  'es', 'eso', 'esta', 'este', 'hace', 'hay', 'la', 'las', 'lo', 'los', 'me', 'mi', 'mis',
  'no', 'para', 'por', 'que', 'se', 'si', 'sobre', 'tengo', 'un', 'una', 'veces', 'y', 'yo',
]);

export function answerWithLocalMemory(question: string, records: LuzMemoryRecord[]): LuzAnswer {
  const normalizedQuestion = normalize(question);
  const terms = buildSearchTerms(normalizedQuestion);

  if (terms.length === 0) {
    return {
      summary: 'Necesito una pregunta un poco mas concreta.',
      bullets: ['Probame con una persona, proyecto, tema o decision especifica.'],
      sources: [],
      confidence: 'low',
    };
  }

  const matches = records
    .map(record => ({ record, score: scoreRecord(record, terms, normalizedQuestion) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || compareDatesDesc(a.record.date, b.record.date))
    .slice(0, 12);

  if (matches.length === 0) {
    return {
      summary: 'No encontre evidencia suficiente en tus datos.',
      bullets: [
        'Puede que el tema este escrito con otras palabras o que todavia no haya suficientes registros.',
        'Cuando conectemos IA semantica real, esta busqueda va a poder encontrar relaciones menos literales.',
      ],
      sources: [],
      confidence: 'low',
    };
  }

  const journalMatches = matches.filter(match => match.record.type === 'journal');
  const financeMatches = matches.filter(match => match.record.type === 'finance');
  const habitMatches = matches.filter(match => match.record.type === 'habit');
  const goalMatches = matches.filter(match => match.record.type === 'goal');
  const top = matches.slice(0, 5).map(match => match.record);

  const bullets = [
    journalMatches.length > 0 ? `${journalMatches.length} coincidencia(s) en Diario.` : null,
    financeMatches.length > 0 ? `${financeMatches.length} coincidencia(s) en Finanzas.` : null,
    habitMatches.length > 0 ? `${habitMatches.length} coincidencia(s) en Habitos.` : null,
    goalMatches.length > 0 ? `${goalMatches.length} coincidencia(s) en Objetivos.` : null,
    buildPatternLine(top),
  ].filter(Boolean) as string[];

  return {
    summary: `Encontre ${matches.length} registro(s) relacionados con tu pregunta.`,
    bullets,
    sources: top,
    confidence: matches.length >= 5 ? 'medium' : 'low',
  };
}

export function toLuzMemoryRecords(input: {
  thoughts: any[];
  finances: any[];
  goals: any[];
  habits: any[];
}): LuzMemoryRecord[] {
  return [
    ...input.thoughts.map(thought => ({
      id: thought.id || createFallbackId('journal', thought.content),
      type: 'journal' as const,
      title: 'Diario',
      body: thought.content || thought.analysis || '',
      date: toDate(thought.timestamp),
      meta: Array.isArray(thought.categories) ? thought.categories.join(', ') : undefined,
    })),
    ...input.finances.map(record => ({
      id: record.id || createFallbackId('finance', record.description),
      type: 'finance' as const,
      title: record.description || record.category || 'Movimiento',
      body: [record.description, record.note, record.category, record.paymentType].filter(Boolean).join(' '),
      date: toDate(record.date),
      meta: `${record.type || 'movimiento'} ${Number(record.amount || 0).toLocaleString()} ${record.currency || ''}`.trim(),
    })),
    ...input.goals.map(goal => ({
      id: goal.id || createFallbackId('goal', goal.title),
      type: 'goal' as const,
      title: goal.title || 'Objetivo',
      body: [goal.title, goal.description, ...(goal.categories || [])].filter(Boolean).join(' '),
      date: toDate(goal.createdAt),
      meta: goal.status,
    })),
    ...input.habits.map(habit => ({
      id: habit.id || createFallbackId('habit', habit.title),
      type: 'habit' as const,
      title: habit.title || 'Habito',
      body: [habit.title, habit.description].filter(Boolean).join(' '),
      date: toDate(habit.createdAt),
      meta: habit.status,
    })),
  ].filter(record => record.body.trim().length > 0);
}

function buildSearchTerms(normalizedQuestion: string) {
  const rawTerms = normalizedQuestion
    .split(/[^a-z0-9]+/i)
    .map(term => term.trim())
    .filter(term => term.length > 2 && !STOPWORDS.has(term));

  const expanded = new Set(rawTerms);
  if (expanded.has('comercial')) {
    expanded.add('ventas');
    expanded.add('vendedor');
  }
  if (expanded.has('equipo')) {
    expanded.add('contratar');
    expanded.add('sumar');
  }
  return Array.from(expanded);
}

function scoreRecord(record: LuzMemoryRecord, terms: string[], normalizedQuestion: string) {
  const haystack = normalize(`${record.title} ${record.body} ${record.meta || ''}`);
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += term.length > 5 ? 3 : 2;
  }

  const phrase = terms.slice(0, 4).join(' ');
  if (phrase.length > 8 && haystack.includes(phrase)) score += 5;
  if (normalizedQuestion.includes('cuantas') || normalizedQuestion.includes('cuantos')) score += score > 0 ? 1 : 0;
  return score;
}

function buildPatternLine(records: LuzMemoryRecord[]) {
  const dated = records.filter(record => record.date).sort((a, b) => compareDatesDesc(a.date, b.date));
  if (dated.length < 2) return 'Todavia no hay suficiente continuidad para hablar de patron.';
  const latest = dated[0].date;
  const oldest = dated[dated.length - 1].date;
  return `Aparece entre ${formatShortDate(oldest)} y ${formatShortDate(latest)} en los registros encontrados.`;
}

function compareDatesDesc(a?: Date | null, b?: Date | null) {
  return (b?.getTime() || 0) - (a?.getTime() || 0);
}

function toDate(value: any) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(date?: Date | null) {
  if (!date) return 'sin fecha';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function createFallbackId(prefix: string, value?: string) {
  return `${prefix}-${normalize(value || '').slice(0, 24)}-${Math.random().toString(36).slice(2, 6)}`;
}
