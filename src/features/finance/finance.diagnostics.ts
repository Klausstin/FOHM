// Chequeos de integridad de saldos: detecta movimientos sin cuenta, transferencias
// sin destino, saldos sin impactar, etc. Extraído de FinanceTracker.tsx (Fase A).
import { shouldApplyTransactionToAccountBalances } from './finance.balance';
import { parseFinanceDateValue } from './finance.format';
import { normalizeDuplicateText } from './finance.duplicates';

export type BalanceIntegrityIssueType =
  | 'missing_balance_application'
  | 'missing_account'
  | 'missing_transfer_destination'
  | 'applied_without_effect';

export interface BalanceIntegrityIssue {
  id: string;
  type: BalanceIntegrityIssueType;
  finance: any;
  title: string;
  helper: string;
  canApplyBalance: boolean;
}

export function buildBalanceIntegrityIssues(finances: any[], accounts: any[] = []) {
  const accountIds = new Set((accounts || []).map(account => account.id));

  return (finances || [])
    .map(finance => {
      const status = finance.status || 'posted';
      if (status === 'ignored') return null;

      const sourceAccountId = finance.sourceAccountId || finance.accountId || '';
      const toAccountId = finance.toAccountId || '';
      const hasRealSourceAccount = sourceAccountId ? accountIds.has(sourceAccountId) : false;
      const hasRealDestinationAccount = toAccountId ? accountIds.has(toAccountId) : false;
      const type = finance.type || (finance.kind === 'income' ? 'income' : finance.kind === 'neutral' ? 'neutral' : 'expense');
      const isBalanceAdjustment = isBalanceAdjustmentTransaction(finance);
      const shouldAffectBalance = shouldApplyTransactionToAccountBalances({
        ...finance,
        accountId: sourceAccountId,
        sourceAccountId,
        toAccountId,
        date: parseFinanceDateValue(finance.date) || new Date(),
      });

      if ((type === 'expense' || type === 'income') && (!sourceAccountId || !hasRealSourceAccount) && Number(finance.amount || 0) > 0) {
        return {
          id: `${finance.id}-missing-account`,
          type: 'missing_account' as const,
          finance,
          title: 'Movimiento sin cuenta usada',
          helper: sourceAccountId
            ? 'Tiene una cuenta heredada del resumen, pero no coincide con una cuenta real de VEO.'
            : 'Tiene monto y tipo financiero, pero no sabemos de que cuenta salio o entro.',
          canApplyBalance: false,
        };
      }

      if (type === 'transfer' && sourceAccountId && (!toAccountId || !hasRealDestinationAccount)) {
        return {
          id: `${finance.id}-missing-transfer-destination`,
          type: 'missing_transfer_destination' as const,
          finance,
          title: 'Transferencia sin destino',
          helper: toAccountId
            ? 'La cuenta destino guardada no coincide con una cuenta real de VEO.'
            : 'Para mover saldo entre cuentas, VEO necesita cuenta origen y cuenta destino.',
          canApplyBalance: false,
        };
      }

      if (shouldAffectBalance && !finance.accountBalanceApplied) {
        return {
          id: `${finance.id}-missing-balance-application`,
          type: 'missing_balance_application' as const,
          finance,
          title: 'No impacto el saldo',
          helper: 'El movimiento esta contabilizado, pero todavia no ajusto el saldo de la cuenta.',
          canApplyBalance: true,
        };
      }

      if (!shouldAffectBalance && finance.accountBalanceApplied && !isBalanceAdjustment) {
        return {
          id: `${finance.id}-applied-without-effect`,
          type: 'applied_without_effect' as const,
          finance,
          title: 'Saldo aplicado con regla dudosa',
          helper: 'El movimiento figura como aplicado, pero por sus datos actuales no deberia mover saldo.',
          canApplyBalance: false,
        };
      }

      return null;
    })
    .filter(Boolean) as BalanceIntegrityIssue[];
}

export function isBalanceAdjustmentTransaction(finance: any) {
  const neutralType = String(finance.neutralType || '').toLowerCase();
  const categoryText = normalizeDuplicateText(`${finance.category || ''} ${finance.subCategory || ''} ${finance.description || ''}`);
  return neutralType === 'balance_adjustment' || categoryText.includes('ajuste saldo');
}
