import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {eyebrow && (
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-black tracking-tight text-neutral-900 md:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm font-medium leading-relaxed text-neutral-500 md:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}
