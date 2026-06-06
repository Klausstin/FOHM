import { useEffect, useState, type ReactNode } from 'react';
import SidebarNav, { type AppTab } from './SidebarNav';

interface AppShellProps {
  activeTab: AppTab;
  children: ReactNode;
  onTabChange: (tab: AppTab) => void;
  user: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  };
}

export default function AppShell({ activeTab, children, onTabChange, user }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('veo.sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('veo.sidebarCollapsed', String(isSidebarCollapsed));
    } catch {
      // La preferencia visual es opcional.
    }
  }, [isSidebarCollapsed]);

  return (
    <div className="min-h-screen bg-[#f6f6f3] text-neutral-900 font-sans">
      <SidebarNav
        activeTab={activeTab}
        isCollapsed={isSidebarCollapsed}
        onTabChange={onTabChange}
        onToggleCollapsed={() => setIsSidebarCollapsed(prev => !prev)}
        user={user}
      />
      <main className={`min-h-screen pb-24 transition-[padding] duration-200 md:pb-0 ${isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'}`}>
        <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 md:px-8 md:py-7 xl:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
