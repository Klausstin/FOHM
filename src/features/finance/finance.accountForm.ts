// Helpers del formulario de cuentas: borradores, limpieza de campos, armado de
// payloads y comparación de cambios. Extraído de FinanceTracker.tsx (Fase A).

export function getAccountTypeLabel(type?: string) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'bank') return 'Banco';
  if (normalized === 'wallet') return 'Billetera';
  if (normalized === 'cash') return 'Efectivo';
  if (normalized === 'credit_card') return 'Tarjeta';
  if (normalized === 'investment') return 'Inversion';
  return normalized || 'Cuenta';
}

export function getAccountHealthLabel(account: any) {
  const type = String(account.type || '').toLowerCase();
  const balance = Number(account.balance || 0);
  if (type === 'credit_card') {
    if (balance < 0) return 'Deuda abierta';
    if (balance === 0) return 'Sin deuda';
    return 'Saldo a favor';
  }
  if (type === 'investment') return 'Patrimonio';
  if (balance < 0) return 'Revisar saldo';
  return 'Disponible';
}

export function createEmptyAccountDraft() {
  return {
    name: '',
    currency: 'ARS',
    balance: 0,
    color: '#3B82F6',
    type: 'bank',
    institution: '',
    accountNumberLast4: '',
    statementLabel: '',
    alias: '',
    closingDay: '',
    dueDay: '',
    creditLimit: '',
    notes: '',
  };
}

export function cleanOptionalText(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

export function cleanOptionalNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function cleanAccountDay(value: unknown) {
  const parsed = cleanOptionalNumber(value);
  if (!parsed) return null;
  return Math.min(31, Math.max(1, Math.round(parsed)));
}

export function buildAccountPayload(draft: any) {
  const type = draft.type || 'bank';
  const isCreditCard = type === 'credit_card';

  return {
    name: String(draft.name || '').trim(),
    currency: draft.currency || 'ARS',
    balance: Number(draft.balance || 0),
    color: draft.color || '#3B82F6',
    type,
    institution: cleanOptionalText(draft.institution),
    accountNumberLast4: cleanOptionalText(draft.accountNumberLast4),
    statementLabel: cleanOptionalText(draft.statementLabel),
    alias: cleanOptionalText(draft.alias),
    closingDay: isCreditCard ? cleanAccountDay(draft.closingDay) : null,
    dueDay: isCreditCard ? cleanAccountDay(draft.dueDay) : null,
    creditLimit: isCreditCard ? cleanOptionalNumber(draft.creditLimit) : null,
    notes: cleanOptionalText(draft.notes),
  };
}

export function buildAccountDraftFromRecord(account: any) {
  return {
    name: account.name || '',
    currency: account.currency || 'ARS',
    balance: Number(account.balance || 0),
    color: account.color || '#3B82F6',
    type: account.type || 'bank',
    institution: account.institution || '',
    accountNumberLast4: account.accountNumberLast4 || '',
    statementLabel: account.statementLabel || '',
    alias: account.alias || '',
    closingDay: account.closingDay || '',
    dueDay: account.dueDay || '',
    creditLimit: account.creditLimit || '',
    notes: account.notes || '',
  };
}

export function normalizeAccountPayloadForCompare(payload: Record<string, any>) {
  const keys = [
    'name',
    'currency',
    'balance',
    'color',
    'type',
    'institution',
    'accountNumberLast4',
    'statementLabel',
    'alias',
    'closingDay',
    'dueDay',
    'creditLimit',
    'notes',
  ];

  return keys.reduce<Record<string, any>>((acc, key) => {
    const value = payload[key];
    acc[key] = value === undefined || value === null ? '' : value;
    return acc;
  }, {});
}

export function accountPayloadHasChanges(nextPayload: Record<string, any>, currentAccount: any) {
  return JSON.stringify(normalizeAccountPayloadForCompare(nextPayload)) !==
    JSON.stringify(normalizeAccountPayloadForCompare(buildAccountPayload(buildAccountDraftFromRecord(currentAccount))));
}

export function buildChangedAccountPatch(nextPayload: Record<string, any>, currentAccount: any) {
  const currentPayload = buildAccountPayload(buildAccountDraftFromRecord(currentAccount));
  return Object.fromEntries(
    Object.entries(nextPayload).filter(([key, value]) => {
      const currentValue = currentPayload[key as keyof typeof currentPayload];
      return JSON.stringify(value ?? null) !== JSON.stringify(currentValue ?? null);
    }),
  );
}

export function hasAccountDraftUserInput(draft: any) {
  return Boolean(
    String(draft.name || '').trim() ||
    Number(draft.balance || 0) !== 0 ||
    String(draft.institution || '').trim() ||
    String(draft.accountNumberLast4 || '').trim() ||
    String(draft.statementLabel || '').trim() ||
    String(draft.alias || '').trim() ||
    String(draft.closingDay || '').trim() ||
    String(draft.dueDay || '').trim() ||
    String(draft.creditLimit || '').trim() ||
    String(draft.notes || '').trim()
  );
}

export function buildBalanceAdjustmentNote(accountName: string, previousBalance: number, nextBalance: number, currency: string) {
  const difference = nextBalance - previousBalance;
  return [
    `Conciliacion manual de ${accountName}.`,
    `Saldo anterior: ${previousBalance.toLocaleString()} ${currency}.`,
    `Saldo real: ${nextBalance.toLocaleString()} ${currency}.`,
    `Diferencia ajustada: ${difference.toLocaleString()} ${currency}.`,
  ].join(' ');
}
