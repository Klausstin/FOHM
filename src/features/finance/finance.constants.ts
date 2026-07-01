// Constantes de opciones compartidas del módulo de finanzas.
// Extraído de FinanceTracker.tsx (Fase B del refactor).

export const FINANCE_SCOPE_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'pareja', label: 'Pareja' },
  { value: 'hogar', label: 'Hogar' },
  { value: 'familia', label: 'Familia' },
];

export const PAYMENT_TYPES = ['Efectivo', 'Tarjeta de Débito', 'Tarjeta de credito', 'Transferencia', 'Mercado Pago', 'Otro'];

export const FINANCE_BENEFICIARIES = [
  { type: 'family', label: 'Familia', scope: 'familia' },
  { type: 'household', label: 'Hogar', scope: 'hogar' },
  { type: 'couple', label: 'Pareja', scope: 'pareja' },
  { type: 'child', label: 'Máximo', scope: 'familia' },
  { type: 'user', label: 'Agustín', scope: 'personal' },
  { type: 'user', label: 'Vicky', scope: 'personal' },
  { type: 'other', label: 'Otro', scope: 'familia' },
];
