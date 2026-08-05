// Muestra el detalle de un movimiento (título, monto, badges, filas de datos y
// detalle bancario colapsable). Extraído de FinanceTracker.tsx (Fase B).
import { isUsefulAuditValue } from '../finance.movementDisplay';
import { PendingMeta } from './PendingMeta';

export function FinanceMovementDetailDisplay({
  title,
  amount,
  amountClassName = 'text-neutral-950',
  subtitle,
  badges = [],
  rows = [],
  technicalRows = [],
  rawRows = [],
  rawExpanded = false,
  onToggleRaw,
}: {
  title: string;
  amount: string;
  amountClassName?: string;
  subtitle?: string;
  badges?: string[];
  rows?: Array<{ label: string; value?: string | number; wrap?: boolean }>;
  technicalRows?: Array<{ label: string; value?: string | number; wrap?: boolean }>;
  rawRows?: Array<{ label: string; value?: string | number; wrap?: boolean }>;
  rawExpanded?: boolean;
  onToggleRaw?: () => void;
}) {
  const visibleRows = rows.filter(row => isUsefulAuditValue(row.value));
  const visibleTechnicalRows = technicalRows.filter(row => isUsefulAuditValue(row.value));
  const visibleRawRows = rawRows.filter(row => isUsefulAuditValue(row.value));

  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-2.5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-neutral-950">{title || 'Movimiento'}</p>
          {subtitle && <p className="mt-0.5 truncate text-[11px] font-bold text-neutral-500">{subtitle}</p>}
          {badges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {badges.filter(Boolean).map(badge => (
                <span key={badge} className="rounded-full border border-neutral-100 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-neutral-500">
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>
        <p className={`shrink-0 text-sm font-black lg:text-right ${amountClassName}`}>{amount}</p>
      </div>

      {visibleRows.length > 0 && (
        <div className="mt-2 grid gap-2 border-t border-neutral-100 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          {visibleRows.map(row => <PendingMeta key={row.label} {...row} />)}
        </div>
      )}

      {visibleTechnicalRows.length > 0 && (
        <div className="mt-2 grid gap-2 border-t border-neutral-100 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          {visibleTechnicalRows.map(row => <PendingMeta key={row.label} {...row} />)}
        </div>
      )}

      {visibleRawRows.length > 0 && (
        <div className="mt-2 border-t border-neutral-100 pt-2">
          {onToggleRaw ? (
            <button
              type="button"
              onClick={onToggleRaw}
              className="rounded-full bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-neutral-500 transition hover:text-neutral-900"
            >
              {rawExpanded ? 'Ocultar detalle banco' : 'Ver detalle banco'}
            </button>
          ) : null}
          {(rawExpanded || !onToggleRaw) && (
            <div className="mt-2 grid gap-2">
              {visibleRawRows.map(row => <PendingMeta key={row.label} {...row} wrap />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
