import type { ReactNode } from 'react';
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
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <SidebarNav activeTab={activeTab} onTabChange={onTabChange} user={user} />
      <main className="min-h-screen pb-24 md:pb-0 md:pl-64">
        <div className="mx-auto max-w-5xl p-6 md:p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
