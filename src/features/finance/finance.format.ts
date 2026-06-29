// Helpers compartidos de formato y parseo para finanzas.
// Extraído de FinanceTracker.tsx (Fase A del refactor).

export function parseFinanceDateValue(value: any) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatSignedMoney(value: number, currency: string) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toLocaleString()} ${currency}`;
}

export function legacyBeneficiaryLabel(finance: any) {
  if (finance.assignedTo === 'Ambos') return 'Pareja';
  return finance.beneficiaryLabel || 'Familia';
}

export function legacyScope(finance: any) {
  if (finance.assignedTo === 'Ambos') return 'pareja';
  return finance.scope || 'familia';
}

export function formatFinanceMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(year, month - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
}

export function formatFinanceScope(scope: string) {
  const labels: Record<string, string> = {
    personal: 'Personal',
    pareja: 'Pareja',
    hogar: 'Hogar',
    familia: 'Familia',
  };
  return labels[scope] || scope || 'Familia';
}
