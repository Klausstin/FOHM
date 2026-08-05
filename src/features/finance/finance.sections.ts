// Secciones/pestañas internas de finanzas + orden persistido.
// Extraído de FinanceTracker.tsx (Fase B del refactor).

export const FINANCE_SECTIONS = [
  { id: 'summary', label: 'Resumen', helper: 'Caja y foco' },
  { id: 'accounts', label: 'Cuentas', helper: 'Billeteras y tarjetas' },
  { id: 'movements', label: 'Movimientos', helper: 'Carga y busqueda' },
  { id: 'import', label: 'Importar', helper: 'PDF y CSV' },
  { id: 'review', label: 'Revisar', helper: 'Pendientes y saldos' },
  { id: 'categories', label: 'Categorias', helper: 'Memoria y reglas' },
  { id: 'reports', label: 'Reportes', helper: 'Lecturas y patrones' },
  { id: 'backup', label: 'Backup', helper: 'Exportar datos' },
] as const;

export type FinanceSectionId = typeof FINANCE_SECTIONS[number]['id'];
export type FinanceSectionConfig = typeof FINANCE_SECTIONS[number];

export const DEFAULT_FINANCE_SECTION_ORDER = FINANCE_SECTIONS.map(section => section.id) as FinanceSectionId[];

export function getFinanceSectionOrderStorageKey(userId?: string) {
  return `veo.finance.sectionOrder.${userId || 'local'}`;
}

export function normalizeFinanceSectionOrder(value: unknown): FinanceSectionId[] {
  const rawOrder = Array.isArray(value) ? value : [];
  const allowedIds = new Set(DEFAULT_FINANCE_SECTION_ORDER);
  const validIds = rawOrder.filter((id): id is FinanceSectionId => allowedIds.has(id as FinanceSectionId));
  const missingIds = DEFAULT_FINANCE_SECTION_ORDER.filter(id => !validIds.includes(id));
  return [...validIds, ...missingIds];
}
