// Menú interno de finanzas (pestañas) con reordenamiento por drag & drop.
// Extraído de FinanceTracker.tsx (Fase B del refactor).
import { useState } from 'react';
import type { FinanceSectionId, FinanceSectionConfig } from '../finance.sections';

export function FinanceInternalNav({
  active,
  onChange,
  sections,
  onReorderSections,
  onResetOrder,
}: {
  active: FinanceSectionId;
  onChange: (section: FinanceSectionId) => void;
  sections: FinanceSectionConfig[];
  onReorderSections: (fromSection: FinanceSectionId, toSection: FinanceSectionId) => void;
  onResetOrder: () => void;
}) {
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [draggedSectionId, setDraggedSectionId] = useState<FinanceSectionId | null>(null);
  const [dropPreviewSectionId, setDropPreviewSectionId] = useState<FinanceSectionId | null>(null);

  const clearDragState = () => {
    setDraggedSectionId(null);
    setDropPreviewSectionId(null);
  };

  return (
    <nav className="sticky top-0 z-20 -mx-2 rounded-b-[1.25rem] bg-[#f7f7f4]/95 px-2 pb-1.5 pt-1 backdrop-blur">
      <div className="rounded-[1.1rem] border border-neutral-200 bg-white p-1 shadow-sm">
        <div className="flex flex-wrap items-stretch gap-1">
          {sections.map(section => {
            const isActive = active === section.id;
            const isDragging = draggedSectionId === section.id;
            const isDropPreview = dropPreviewSectionId === section.id && !isDragging;
            return (
              <button
                key={section.id}
                type="button"
                draggable={isEditingOrder}
                onClick={() => {
                  if (!isEditingOrder) onChange(section.id);
                }}
                onDragStart={(event) => {
                  if (!isEditingOrder) return;
                  setDraggedSectionId(section.id);
                  setDropPreviewSectionId(null);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', section.id);
                }}
                onDragEnter={(event) => {
                  if (!isEditingOrder || !draggedSectionId || draggedSectionId === section.id) return;
                  event.preventDefault();
                  setDropPreviewSectionId(section.id);
                  onReorderSections(draggedSectionId, section.id);
                }}
                onDragOver={(event) => {
                  if (!isEditingOrder) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => {
                  if (!isEditingOrder) return;
                  event.preventDefault();
                  clearDragState();
                }}
                onDragEnd={clearDragState}
                title={section.helper}
                className={`rounded-xl px-3 py-1.5 text-left transition-all duration-150 ${
                  isEditingOrder
                    ? `cursor-grab border border-dashed active:cursor-grabbing ${
                      isDragging
                        ? 'scale-95 border-neutral-900 bg-neutral-100 opacity-70 shadow-inner'
                        : isDropPreview
                          ? 'scale-[1.02] border-neutral-900 bg-neutral-50 text-neutral-950 shadow-sm'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50'
                    }`
                    : isActive
                      ? 'bg-neutral-950 text-white shadow-sm'
                      : 'bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950'
                }`}
              >
                <span className="block text-[11px] font-black uppercase tracking-widest">{section.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIsEditingOrder(value => !value)}
            className="ml-auto rounded-xl border border-neutral-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400 transition hover:border-neutral-200 hover:text-neutral-800"
          >
            {isEditingOrder ? 'Cerrar orden' : 'Editar orden'}
          </button>
        </div>

        {isEditingOrder && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Arrastra una tab: la barra previsualiza el lugar antes de soltar.
            </p>
            <button
              type="button"
              onClick={onResetOrder}
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900"
            >
              Restablecer orden
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
