// Pieza compartida: muestra una etiqueta + valor (usada por varios paneles de
// finanzas). Extraída de FinanceTracker.tsx (Fase B del refactor).

export function PendingMeta({ label, value, wrap = false }: { label: string; value?: string | number; wrap?: boolean }) {
  const displayValue = value === 0 || value ? value : '-';
  return (
    <div className={wrap ? 'min-w-0 sm:col-span-2 lg:col-span-4' : 'min-w-0'}>
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={`mt-1 text-xs font-black text-neutral-800 ${wrap ? 'whitespace-normal break-all leading-5' : 'truncate'}`}>
        {displayValue}
      </p>
    </div>
  );
}
