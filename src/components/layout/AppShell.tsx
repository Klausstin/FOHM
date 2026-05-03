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
    <div className="min-h-screen bg-[#f6f6f3] text-neutral-900 font-sans">
      <SidebarNav activeTab={activeTab} onTabChange={onTabChange} user={user} />
      <main className="min-h-screen pb-24 md:pb-0 md:pl-72">
        <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 md:px-8 md:py-8 xl:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
