import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, doc, getDoc, setDoc, collection, query, where, onSnapshot } from './firebase.ts';
import Auth from './components/Auth.tsx';
import Dashboard from './components/Dashboard.tsx';
import MindTracker from './components/MindTracker.tsx';
import FinanceTracker from './components/FinanceTracker.tsx';
import AnnualGoals from './components/AnnualGoals.tsx';
import Settings from './components/Settings.tsx';
import Habits from './components/Habits.tsx';
import CalendarIntegration from './components/CalendarIntegration.tsx';
import { Brain, Wallet, Home, LogOut, User as UserIcon, Settings as SettingsIcon, Target, CheckCircle2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const getDefaultHouseholdId = (uid: string) => `personal-${uid}`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'mind' | 'finance' | 'settings' | 'goals' | 'habits' | 'calendar'>('home');

  useEffect(() => {
    (window as any).setActiveTab = setActiveTab;
  }, []);
  const [habits, setHabits] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [thoughts, setThoughts] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        let profileData;
        if (!userSnap.exists()) {
          profileData = {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            createdAt: new Date(),
            role: 'client',
            householdId: getDefaultHouseholdId(currentUser.uid),
            language: 'es',
            primaryCurrency: 'ARS',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            sharingConfig: {
              goals: false,
              mind: false,
              finances: false,
              habits: false,
            },
          };
          await setDoc(userRef, profileData);
        } else {
          profileData = userSnap.data();
          if (!profileData.householdId) {
            profileData.householdId = getDefaultHouseholdId(currentUser.uid);
            await setDoc(userRef, { householdId: profileData.householdId }, { merge: true });
          }
        }
        setUser(currentUser);
        setUserProfile(profileData);

        // Fetch data for calendar integration
        const qHabits = query(collection(db, 'habits'), where('uid', '==', currentUser.uid));
        const qGoals = query(collection(db, 'goals'), where('uid', '==', currentUser.uid));
        const qThoughts = query(collection(db, 'thoughts'), where('uid', '==', currentUser.uid));

        onSnapshot(qHabits, (snap) => setHabits(snap.docs.map(d => d.data())));
        onSnapshot(qGoals, (snap) => setGoals(snap.docs.map(d => d.data())));
        onSnapshot(qThoughts, (snap) => setThoughts(snap.docs.map(d => d.data())));
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="animate-pulse text-neutral-400">Cargando...</div>
      </div>
    );
  }

  if (!user || !userProfile) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-6 py-3 md:top-0 md:bottom-auto md:h-screen md:w-64 md:border-t-0 md:border-r z-50">
        <div className="flex md:flex-col h-full justify-between items-center md:items-start">
          <div className="hidden md:block mb-12 mt-4">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
              <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center text-white">
                <Brain size={18} />
              </div>
              Mind & Money
            </h1>
          </div>

          <div className="flex md:flex-col gap-8 md:gap-4 w-full">
            <NavItem 
              active={activeTab === 'home'} 
              onClick={() => setActiveTab('home')} 
              icon={<Home size={20} />} 
              label="Inicio" 
            />
            <NavItem 
              active={activeTab === 'mind'} 
              onClick={() => setActiveTab('mind')} 
              icon={<Brain size={20} />} 
              label="Diario Mental" 
            />
            <NavItem 
              active={activeTab === 'finance'} 
              onClick={() => setActiveTab('finance')} 
              icon={<Wallet size={20} />} 
              label="Finanzas" 
            />
            <NavItem 
              active={activeTab === 'goals'} 
              onClick={() => setActiveTab('goals')} 
              icon={<Target size={20} />} 
              label="Objetivos" 
            />
            <NavItem 
              active={activeTab === 'habits'} 
              onClick={() => setActiveTab('habits')} 
              icon={<CheckCircle2 size={20} />} 
              label="Hábitos" 
            />
            <NavItem 
              active={activeTab === 'calendar'} 
              onClick={() => setActiveTab('calendar')} 
              icon={<Calendar size={20} />} 
              label="Calendario" 
            />
            <NavItem 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')} 
              icon={<SettingsIcon size={20} />} 
              label="Ajustes" 
            />
          </div>

          <div className="md:mt-auto flex md:flex-col gap-4 items-center md:items-start w-full">
            <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-neutral-100 transition-colors w-full">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center">
                  <UserIcon size={16} className="text-neutral-500" />
                </div>
              )}
              <div className="hidden md:block overflow-hidden">
                <p className="text-sm font-medium truncate">{user.displayName || 'Usuario'}</p>
                <p className="text-xs text-neutral-500 truncate">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all md:w-full md:flex md:items-center md:gap-3"
            >
              <LogOut size={20} />
              <span className="hidden md:block text-sm font-medium">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pb-24 md:pb-0 md:pl-64 min-h-screen">
        <div className="max-w-5xl mx-auto p-6 md:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'home' && <Dashboard user={userProfile} />}
              {activeTab === 'mind' && <MindTracker user={userProfile} />}
              {activeTab === 'finance' && <FinanceTracker user={userProfile} />}
              {activeTab === 'goals' && <AnnualGoals user={userProfile} />}
              {activeTab === 'habits' && <Habits user={userProfile} />}
              {activeTab === 'calendar' && (
                <CalendarIntegration 
                  user={userProfile} 
                  habits={habits} 
                  goals={goals} 
                  thoughts={thoughts} 
                />
              )}
              {activeTab === 'settings' && <Settings user={userProfile} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-2xl transition-all w-full ${
        active 
          ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' 
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      {icon}
      <span className="hidden md:block text-sm font-semibold">{label}</span>
    </button>
  );
}
