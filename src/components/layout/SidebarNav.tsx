import type { ReactNode } from 'react';
import { Brain, Calendar, CheckCircle2, Home, LogOut, Settings, Sparkles, Target, User as UserIcon, Wallet } from 'lucide-react';
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
  { id: 'habits', label: 'Habitos', icon: <CheckCircle2 size={20} /> },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur-xl md:bottom-auto md:top-0 md:h-screen md:w-72 md:border-r md:border-t-0 md:border-white/10 md:bg-[#111111] md:px-5 md:py-6 md:text-white">
      <div className="flex h-full items-center justify-between md:flex-col md:items-stretch">
        <div className="hidden md:block">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-neutral-950">
              <Brain size={21} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">VEO</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Vida en Orden</p>
            </div>
          </div>

          <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              <Sparkles size={13} />
              Luz
            </div>
            <p className="text-sm font-semibold leading-5 text-white/80">
              Te ayuda a ver patrones, contradicciones y proximos pasos.
            </p>
          </div>
        </div>

        <div className="flex w-full justify-between gap-1 md:mt-8 md:flex-col md:justify-start md:gap-1.5">
          <p className="mb-2 hidden px-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 md:block">Sistema</p>
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

        <div className="hidden w-full md:mt-auto md:flex md:flex-col md:gap-3">
          <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <UserIcon size={16} className="text-white/50" />
              </div>
            )}
            <div className="overflow-hidden">
              <p className="truncate text-sm font-bold text-white">{user.displayName || 'Usuario'}</p>
              <p className="truncate text-xs text-white/40">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => auth.signOut()}
            className="flex w-full items-center gap-3 rounded-2xl p-3 text-white/50 transition-all hover:bg-white/10 hover:text-white"
          >
            <LogOut size={20} />
            <span className="text-sm font-bold">Cerrar sesion</span>
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
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all md:h-auto md:w-full md:justify-start md:gap-3 md:px-3 md:py-3.5 ${
        active
          ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200 md:bg-white md:text-neutral-950 md:shadow-none'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 md:text-white/50 md:hover:bg-white/10 md:hover:text-white'
      }`}
    >
      {icon}
      <span className="hidden text-sm font-bold md:block">{label}</span>
    </button>
  );
}
