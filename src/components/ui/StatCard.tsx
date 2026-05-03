import type { ReactNode } from 'react';
import Card from './Card';

interface StatCardProps {
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: ReactNode;
}

export default function StatCard({ label, value, helper, icon }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
          <div className="mt-2 text-2xl font-black text-neutral-900">{value}</div>
          {helper && <p className="mt-1 text-xs font-medium text-neutral-500">{helper}</p>}
        </div>
        {icon && <div className="rounded-xl bg-neutral-50 p-3 text-neutral-500">{icon}</div>}
      </div>
    </Card>
  );
}
