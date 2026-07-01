// Tarjeta con el rastro de una transferencia (destinatario, alias, CBU/CVU).
// Extraída de FinanceTracker.tsx (Fase B del refactor).
import type { PendingTransaction } from '../finance.importTypes';
import { PendingMeta } from './PendingMeta';

export function TransferTraceCard({ transaction }: { transaction: PendingTransaction }) {
  const hasTrace = transaction.counterpartyName || transaction.counterpartyAlias || transaction.counterpartyAccount || transaction.transferDetail;
  if (!hasTrace) {
    return (
      <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Rastro de transferencia</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-neutral-500">
          El PDF no trajo destinatario, alias o CBU/CVU en una forma clara. Conservamos el concepto original para rastrearlo.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Rastro de transferencia</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PendingMeta label="Destinatario" value={transaction.counterpartyName} />
        <PendingMeta label="Alias" value={transaction.counterpartyAlias} />
        <PendingMeta label="CBU/CVU" value={transaction.counterpartyAccount} />
        <PendingMeta label="Detalle" value={transaction.transferDetail} />
      </div>
    </div>
  );
}
