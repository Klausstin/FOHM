import type { Visibility } from './models';

export const DEFAULT_PRIVATE_VISIBILITY: Visibility = 'private';

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Privado',
  shared_with_partner: 'Compartido con pareja',
  household_shared: 'Compartido con grupo',
  app_public: 'Público dentro de la app',
};

export function isPrivateVisibility(visibility?: Visibility) {
  return !visibility || visibility === 'private';
}

export function canReadByVisibility(params: {
  visibility?: Visibility;
  ownerId: string;
  viewerId: string;
  sameHousehold?: boolean;
}) {
  const visibility = params.visibility || DEFAULT_PRIVATE_VISIBILITY;

  if (params.ownerId === params.viewerId) return true;
  if (visibility === 'private') return false;
  if (visibility === 'shared_with_partner') return Boolean(params.sameHousehold);
  if (visibility === 'household_shared') return Boolean(params.sameHousehold);

  return visibility === 'app_public';
}

export function getDefaultVisibilityForCollection(collection: string): Visibility {
  if (collection === 'journalEntries' || collection === 'thoughts') {
    return 'private';
  }

  return 'private';
}
