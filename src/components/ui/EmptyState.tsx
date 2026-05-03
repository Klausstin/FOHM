import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-[2rem] border-2 border-dashed border-neutral-200 bg-neutral-50 px-6 py-12 text-center">
      {icon && (
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-neutral-300 shadow-sm">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-black text-neutral-900">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-neutral-500">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
