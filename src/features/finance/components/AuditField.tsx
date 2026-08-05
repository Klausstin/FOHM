// Pieza compartida: etiqueta + control de formulario. Usada por varios formularios
// de finanzas. Extraída de FinanceTracker.tsx (Fase B del refactor).
import React from 'react';

export function AuditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
