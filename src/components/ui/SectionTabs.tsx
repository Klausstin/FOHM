import type { ReactNode } from 'react';

export interface SectionTab<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface SectionTabsProps<T extends string> {
  tabs: SectionTab<T>[];
  value: T;
  onChange: (value: T) => void;
}

export default function SectionTabs<T extends string>({ tabs, value, onChange }: SectionTabsProps<T>) {
  return (
    <div className="inline-flex rounded-2xl bg-neutral-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            value === tab.id
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-700'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
