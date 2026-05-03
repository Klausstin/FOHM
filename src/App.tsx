import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, doc, getDoc, setDoc, collection, query, where, onSnapshot } from './firebase.ts';
import Auth from './components/Auth.tsx';
import Dashboard from './components/Dashboard.tsx';
import MindTracker from './components/MindTracker.tsx';
import FinanceTracker from './components/FinanceTracker.tsx';
import AnnualGoals from './components/AnnualGoals.tsx';
import Settings from './components/Settings.tsx';
import Habits from './components/Habits.tsx';
import CalendarIntegration from './components/CalendarIntegration.tsx';
import AppShell from './components/layout/AppShell.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import type { AppTab } from './components/layout/SidebarNav.tsx';
import { getPersonalHouseholdId } from './domain/household.ts';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [habits, setHabits] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [thoughts, setThoughts] = useState<any[]>([]);

  useEffect(() => {
    (window as any).setActiveTab = setActiveTab;
  }, []);

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
            householdId: getPersonalHouseholdId(currentUser.uid),
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
            profileData.householdId = getPersonalHouseholdId(currentUser.uid);
            await setDoc(userRef, { householdId: profileData.householdId }, { merge: true });
          }
        }

        setUser(currentUser);
        setUserProfile(profileData);

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
    <AppShell activeTab={activeTab} onTabChange={setActiveTab} user={user}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <ErrorBoundary screenName={activeTab}>
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
          </ErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
