import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-neutral-100 bg-white shadow-sm shadow-neutral-200/40 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
