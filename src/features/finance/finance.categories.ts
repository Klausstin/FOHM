// Claridad y agrupación de categorías: detecta gastos con categoría floja y agrupa
// los movimientos "Otros" similares para resolverlos juntos.
// Extraído de FinanceTracker.tsx (Fase A del refactor).
import { normalizeDuplicateText } from './finance.duplicates';
import { legacyBeneficiaryLabel, legacyScope } from './finance.format';
import { parseFinanceTraceNote } from './finance.trace';

export function isUnclearFinanceCategory(finance: any) {
  const category = normalizeDuplicateText(finance.category || '');
  const subCategory = normalizeDuplicateText(finance.subCategory || '');
  return (
    !category ||
    category === 'sin categorizar' ||
    category === 'sin categoria' ||
    category === 'otros' ||
    subCategory === 'otros' ||
    finance.confidence === 'inferred'
  );
}

export function getFinanceCategoryClarityStats(finances: any[]) {
  const expenses = finances.filter(finance => finance.status !== 'ignored' && finance.type === 'expense');
  const unclear = expenses.filter(isUnclearFinanceCategory);
  const totalAmountByCurrency = new Map<string, number>();

  for (const finance of unclear) {
    const currency = finance.currency || 'ARS';
    totalAmountByCurrency.set(currency, (totalAmountByCurrency.get(currency) || 0) + Number(finance.amount || 0));
  }

  return {
    count: unclear.length,
    expenseCount: expenses.length,
    share: expenses.length ? unclear.length / expenses.length : 0,
    totalAmountByCurrency: Array.from(totalAmountByCurrency.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
  };
}

export function buildFinanceCategoryGroups(finances: any[]) {
  const groups = new Map<string, any[]>();
  const candidates = finances.filter(finance => {
    if (finance.status === 'ignored' || finance.type !== 'expense') return false;
    return isUnclearFinanceCategory(finance);
  });

  for (const finance of candidates) {
    const key = getFinanceCategoryGroupKey(finance);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), finance]);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const amounts = items.map(item => Number(item.amount || 0)).filter(Number.isFinite);
      const first = items[0];
      return {
        key,
        label: first.merchantName || first.description || first.originalDescription || 'Movimiento similar',
        count: items.length,
        averageAmount: amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length : 0,
        currency: first.currency || 'ARS',
        currentCategory: first.category || 'Sin categorizar',
        reason: getFinanceCategoryGroupReason(first),
        originalDescription: first.originalDescription || first.description || '',
        merchantName: first.merchantName || '',
        merchantKey: first.merchantKey || '',
        accountId: first.accountId || '',
        sourceAccountId: first.sourceAccountId || first.accountId || '',
        toAccountId: first.toAccountId || '',
        paymentType: first.paymentType || '',
        beneficiaryType: first.beneficiaryType || '',
        beneficiaryLabel: first.beneficiaryLabel || legacyBeneficiaryLabel(first),
        scope: first.scope || legacyScope(first),
        visibility: first.visibility || 'household_shared',
        transactionIds: items.map(item => item.id).filter(Boolean),
        samples: items.slice(0, 5).map(item => {
          const trace = parseFinanceTraceNote(item.note);
          return {
            id: item.id,
            date: item.date,
            amount: Number(item.amount || 0),
            currency: item.currency || first.currency || 'ARS',
            description: item.description || '',
            originalDescription: item.originalDescription || trace.originalConcept || '',
            merchantName: item.merchantName || item.merchant || '',
            importSource: item.importSource || '',
            importedFile: trace.importedFile || '',
            sourceAccountId: item.sourceAccountId || item.accountId || '',
            toAccountId: item.toAccountId || '',
            paymentType: item.paymentType || '',
            beneficiaryLabel: item.beneficiaryLabel || legacyBeneficiaryLabel(item),
            sourceLine: trace.sourceLine || '',
            installmentLabel: trace.installmentLabel || '',
            transferDetail: trace.transferDetail || '',
            counterpartyName: trace.counterpartyName || '',
            counterpartyAlias: trace.counterpartyAlias || '',
            counterpartyAccount: trace.counterpartyAccount || '',
            transactionFingerprint: item.transactionFingerprint || '',
            statementFingerprint: item.statementFingerprint || '',
          };
        }),
      };
    })
    .filter(group => group.count >= 2)
    .sort((a, b) => b.count - a.count || b.averageAmount - a.averageAmount)
    .slice(0, 6);
}

export function getFinanceCategoryGroupKey(finance: any) {
  const trace = parseFinanceTraceNote(finance.note);
  const merchantText = normalizeDuplicateText(`${finance.merchantName || ''} ${finance.merchant || ''} ${finance.merchantKey || ''}`);
  if (finance.merchantKey && !isGenericBankMovementText(merchantText)) {
    return `merchant:${finance.merchantKey}`;
  }

  const counterpartyText = normalizeDuplicateText([
    trace.counterpartyAlias,
    trace.counterpartyAccount,
    trace.counterpartyName,
  ].filter(Boolean).join(' '));
  if (counterpartyText) return `counterparty:${counterpartyText}`;

  const rawDescription = trace.originalConcept || finance.originalDescription || finance.description || '';
  const descriptionText = normalizeDuplicateText(rawDescription);
  if (!descriptionText) return '';

  if (isGenericBankMovementText(descriptionText)) {
    const amount = Math.round(Number(finance.amount || 0) * 100);
    const currency = finance.currency || 'ARS';
    return amount ? `generic-bank-label:${descriptionText}:${currency}:${amount}` : '';
  }

  return `description:${descriptionText}`;
}

export function isGenericBankMovementText(value: string) {
  const normalized = normalizeDuplicateText(value || '');
  return [
    'pago con visa debito',
    'debito directo',
    'operacion en efectivo tarje',
    'operacion en efectivo tarjeta',
    'compra con tarjeta',
    'pago con tarjeta',
    'consumo tarjeta',
    'visa debito',
    'mastercard debito',
  ].some(label => normalized === label || normalized.includes(label));
}

export function getFinanceCategoryGroupReason(finance: any) {
  const category = normalizeDuplicateText(finance.category || '');
  const subCategory = normalizeDuplicateText(finance.subCategory || '');
  const rawDescription = normalizeDuplicateText(finance.originalDescription || finance.description || '');
  if (isGenericBankMovementText(rawDescription)) return 'Etiqueta bancaria generica';
  if (!category || category === 'sin categorizar' || category === 'sin categoria') return 'Sin categoria clara';
  if (category === 'otros' || subCategory === 'otros') return 'Cayo en Otros';
  if (finance.confidence === 'inferred') return 'Clasificacion inferida';
  return 'Revisar precision';
}
