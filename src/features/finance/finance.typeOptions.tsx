// Opciones de tipo de movimiento (con íconos) para los selectores de finanzas.
// Extraído de FinanceTracker.tsx (Fase B del refactor). Es .tsx porque los ítems
// llevan íconos JSX.
import { TrendingDown, TrendingUp, PieChart } from 'lucide-react';

export const FINANCE_TYPES = [
  { id: 'expense', label: 'Gasto', icon: <TrendingDown size={14} />, color: 'text-red-600', bg: 'bg-red-50', activeClass: 'bg-red-500 text-white border-red-500 shadow-md' },
  { id: 'income', label: 'Ingreso', icon: <TrendingUp size={14} />, color: 'text-green-600', bg: 'bg-green-50', activeClass: 'bg-green-500 text-white border-green-500 shadow-md' },
  { id: 'transfer', label: 'Transferencia', icon: <PieChart size={14} />, color: 'text-yellow-600', bg: 'bg-yellow-50', activeClass: 'bg-yellow-500 text-white border-yellow-500 shadow-md' },
];
