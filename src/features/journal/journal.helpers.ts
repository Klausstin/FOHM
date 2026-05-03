import type { CreateJournalEntryInput, JournalReflection, SelectedJournalImage } from './journal.types';

export const EMPTY_REFLECTION: JournalReflection = {
  emotions: '',
  explanation: '',
  highlights: '',
  productivity: '',
};

export const REFLECTION_PRODUCTIVITY_OPTIONS = [
  'Si, todo',
  'La gran mayoria',
  'Algo',
  'Casi nada',
];

export function buildReflectionContent(reflection: JournalReflection) {
  return `
### Reflexion del dia
**Emociones:** ${reflection.emotions}
**Explicacion:** ${reflection.explanation}
**Hitos del dia:** ${reflection.highlights}
**Cumplio objetivos?:** ${reflection.productivity}
  `.trim();
}

export function buildFinalJournalContent(baseContent: string, reflection: JournalReflection, includeReflection: boolean) {
  const trimmedBase = baseContent.trim();
  if (!includeReflection) return trimmedBase;

  const reflectionText = buildReflectionContent(reflection);
  return trimmedBase ? `${trimmedBase}\n\n${reflectionText}` : reflectionText;
}

export function buildJournalEntryPayload(input: CreateJournalEntryInput) {
  const payload: Record<string, unknown> = {
    uid: input.uid,
    content: input.content,
    categories: input.categories,
    timestamp: new Date(),
  };

  if (input.image) {
    payload.imageUrl = buildInlineImageUrl(input.image);
  }

  if (input.imageAnalysis) {
    payload.analysis = input.imageAnalysis;
  }

  return payload;
}

function buildInlineImageUrl(image: SelectedJournalImage) {
  return `data:${image.type};base64,${image.data}`;
}
