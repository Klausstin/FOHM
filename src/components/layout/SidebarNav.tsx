import type { ReactNode } from 'react';
import { Brain, Calendar, CheckCircle2, Home, LogOut, Settings, Target, User as UserIcon, Wallet } from 'lucide-react';
import { auth } from '../../firebase.ts';

export type AppTab = 'home' | 'mind' | 'finance' | 'settings' | 'goals' | 'habits' | 'calendar';

interface NavItemConfig {
  id: AppTab;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'home', label: 'Inicio', icon: <Home size={20} /> },
  { id: 'mind', label: 'Diario Mental', icon: <Brain size={20} /> },
  { id: 'finance', label: 'Finanzas', icon: <Wallet size={20} /> },
  { id: 'goals', label: 'Objetivos', icon: <Target size={20} /> },
  { id: 'habits', label: 'Hábitos', icon: <CheckCircle2 size={20} /> },
  { id: 'calendar', label: 'Calendario', icon: <Calendar size={20} /> },
  { id: 'settings', label: 'Ajustes', icon: <Settings size={20} /> },
];

interface SidebarNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  user: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  };
}

export default function SidebarNav({ activeTab, onTabChange, user }: SidebarNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-200 bg-white px-4 py-3 md:bottom-auto md:top-0 md:h-screen md:w-64 md:border-r md:border-t-0 md:px-6">
      <div className="flex h-full items-center justify-between md:flex-col md:items-start">
        <div className="hidden md:mb-12 md:mt-4 md:block">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-neutral-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Brain size={18} />
            </div>
            Mind & Money
          </h1>
        </div>

        <div className="flex w-full justify-between gap-1 md:flex-col md:justify-start md:gap-3">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              active={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </div>

        <div className="hidden w-full md:mt-auto md:flex md:flex-col md:gap-4">
          <div className="flex w-full items-center gap-3 rounded-xl p-2 transition-colors hover:bg-neutral-100">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200">
                <UserIcon size={16} className="text-neutral-500" />
              </div>
            )}
            <div className="overflow-hidden">
              <p className="truncate text-sm font-medium">{user.displayName || 'Usuario'}</p>
              <p className="truncate text-xs text-neutral-500">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => auth.signOut()}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-neutral-500 transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all md:h-auto md:w-full md:justify-start md:gap-3 md:p-3 ${
        active
          ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      {icon}
      <span className="hidden text-sm font-semibold md:block">{label}</span>
    </button>
  );
}
