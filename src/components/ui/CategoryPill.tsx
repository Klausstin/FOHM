interface CategoryPillProps {
  label: string;
  icon?: string;
  className?: string;
}

export default function CategoryPill({ label, icon, className = '' }: CategoryPillProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border border-neutral-100 bg-neutral-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500 ${className}`}>
      {icon && <span>{icon}</span>}
      {label}
    </span>
  );
}
