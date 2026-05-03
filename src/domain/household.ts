export const PERSONAL_HOUSEHOLD_PREFIX = 'personal';

export const HOUSEHOLD_FEATURE_LABELS: Record<string, string> = {
  goals: 'Objetivos',
  finances: 'Finanzas',
  habits: 'Hábitos',
};

export const JOURNAL_PRIVACY_NOTE = 'El Diario Mental es privado por defecto y no se comparte automáticamente.';

export function getPersonalHouseholdId(uid: string) {
  return `${PERSONAL_HOUSEHOLD_PREFIX}-${uid}`;
}

export function isPersonalHousehold(householdId?: string | null) {
  return Boolean(householdId?.startsWith(`${PERSONAL_HOUSEHOLD_PREFIX}-`));
}

export function getHouseholdDisplayName(householdId?: string | null) {
  if (!householdId) return 'Grupo sin configurar';
  if (isPersonalHousehold(householdId)) return 'Espacio personal';

  return 'Grupo familiar';
}

export function getHouseholdDescription(householdId?: string | null) {
  if (isPersonalHousehold(householdId)) {
    return 'Tu espacio actual es personal. Podés preparar datos compartidos sin exponer tu diario.';
  }

  return 'Este grupo puede compartir objetivos, hábitos y finanzas según los permisos configurados.';
}
