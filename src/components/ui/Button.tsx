import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-lg shadow-neutral-200',
  secondary: 'bg-white text-neutral-900 border border-neutral-200 hover:bg-neutral-50',
  ghost: 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
  danger: 'text-red-600 hover:bg-red-50 hover:text-red-700',
};

export default function Button({ children, icon, variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
