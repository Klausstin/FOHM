import type { ReactNode } from 'react';
import { Brain, Calendar, CheckCircle2, Gift, Home, ListTodo, LogOut, MessageCircle, PanelLeftClose, PanelLeftOpen, Settings, Target, User as UserIcon, Wallet } from 'lucide-react';
import { auth } from '../../firebase.ts';

export type AppTab = 'home' | 'luz' | 'mind' | 'tasks' | 'finance' | 'wishlist' | 'settings' | 'goals' | 'habits' | 'calendar';

interface NavItemConfig {
  id: AppTab;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'luz', label: 'Luz', icon: <MessageCircle size={20} /> },
  { id: 'home', label: 'Panel General', icon: <Home size={20} /> },
  { id: 'mind', label: 'Diario Mental', icon: <Brain size={20} /> },
  { id: 'goals', label: 'Objetivos', icon: <Target size={20} /> },
  { id: 'habits', label: 'Hábitos', icon: <CheckCircle2 size={20} /> },
  { id: 'calendar', label: 'Calendario', icon: <Calendar size={20} /> },
  { id: 'tasks', label: 'Tareas', icon: <ListTodo size={20} /> },
  { id: 'finance', label: 'Finanzas', icon: <Wallet size={20} /> },
  { id: 'wishlist', label: 'La Lista', icon: <Gift size={20} /> },
  { id: 'settings', label: 'Ajustes', icon: <Settings size={20} /> },
];

interface SidebarNavProps {
  activeTab: AppTab;
  isCollapsed: boolean;
  onTabChange: (tab: AppTab) => void;
  onToggleCollapsed: () => void;
  user: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  };
}

export default function SidebarNav({ activeTab, isCollapsed, onTabChange, onToggleCollapsed, user }: SidebarNavProps) {
  return (
    <nav className={`fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur-xl transition-[width] duration-200 md:bottom-auto md:top-0 md:h-screen md:border-r md:border-t-0 md:border-white/10 md:bg-[#111111] md:py-5 md:text-white ${isCollapsed ? 'md:w-20 md:px-3' : 'md:w-64 md:px-4'}`}>
      <div className="flex h-full items-center justify-between md:flex-col md:items-stretch">
        <div className="hidden md:block">
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
            <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-neutral-950">
              <Brain size={21} />
              </div>
              {!isCollapsed && (
                <div>
                  <h1 className="text-2xl font-black tracking-tight">VEO</h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Vida en Orden</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={`hidden rounded-xl p-2 text-white/35 transition hover:bg-white/10 hover:text-white md:inline-flex ${isCollapsed ? 'absolute right-3 top-5' : ''}`}
              title={isCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            >
              {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>
        </div>

        <div className={`flex w-full justify-start gap-1 overflow-x-auto md:flex-col md:justify-start md:gap-1.5 md:overflow-visible ${isCollapsed ? 'md:mt-8' : 'md:mt-7'}`}>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              active={activeTab === item.id}
              collapsed={isCollapsed}
              onClick={() => onTabChange(item.id)}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </div>

        <div className="hidden w-full md:mt-auto md:flex md:flex-col md:gap-3">
          <div className={`flex w-full items-center rounded-2xl border border-white/10 bg-white/[0.06] p-3 ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <UserIcon size={16} className="text-white/50" />
              </div>
            )}
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="truncate text-sm font-bold text-white">{user.displayName || 'Usuario'}</p>
                <p className="truncate text-xs text-white/40">{user.email}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => auth.signOut()}
            className={`flex w-full items-center rounded-2xl p-3 text-white/50 transition-all hover:bg-white/10 hover:text-white ${isCollapsed ? 'justify-center' : 'gap-3'}`}
            title="Cerrar sesión"
          >
            <LogOut size={20} />
            {!isCollapsed && <span className="text-sm font-bold">Cerrar sesión</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavItem({ active, collapsed, onClick, icon, label }: { active: boolean; collapsed: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all md:h-auto md:w-full md:py-3 ${
        active
          ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200 md:bg-white md:text-neutral-950 md:shadow-none'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 md:text-white/50 md:hover:bg-white/10 md:hover:text-white'
      } ${collapsed ? 'md:justify-center md:px-0' : 'md:justify-start md:gap-3 md:px-3'}`}
    >
      {icon}
      {!collapsed && <span className="hidden text-sm font-bold md:block">{label}</span>}
    </button>
  );
}
