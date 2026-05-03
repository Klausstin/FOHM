import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { CreateHabitInput, HabitLogRecord, HabitRecord } from './habit.types';

export function subscribeToHouseholdHabits(
  householdId: string,
  onHabits: (habits: HabitRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  const habitsQuery = query(collection(db, 'habits'), where('householdId', '==', householdId));
  return onSnapshot(
    habitsQuery,
    snapshot => onHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HabitRecord))),
    onError,
  );
}

export function subscribeToUserHabitLogs(
  uid: string,
  onLogs: (logs: HabitLogRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  const logsQuery = query(collection(db, 'habitLogs'), where('uid', '==', uid));
  return onSnapshot(
    logsQuery,
    snapshot => onLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HabitLogRecord))),
    onError,
  );
}

export async function createHabit(input: CreateHabitInput) {
  await addDoc(collection(db, 'habits'), {
    uid: input.uid,
    householdId: input.householdId || null,
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    progress: 0,
    streak: 0,
    lastWatered: null,
    incorporated: false,
    status: 'active',
    linkedGoalIds: input.linkedGoalIds,
    createdAt: serverTimestamp(),
  });
}

export async function createHabitLog(habitId: string, uid: string, date: string, status: HabitLogRecord['status']) {
  await addDoc(collection(db, 'habitLogs'), {
    habitId,
    uid,
    date,
    status,
    timestamp: serverTimestamp(),
  });
}

export async function updateHabitLog(logId: string, status: HabitLogRecord['status']) {
  await updateDoc(doc(db, 'habitLogs', logId), {
    status,
    timestamp: serverTimestamp(),
  });
}

export async function deleteHabitLog(logId: string) {
  await deleteDoc(doc(db, 'habitLogs', logId));
}

export async function updateHabitProgress(habitId: string, progress: number, streak: number, hasCurrentLog: boolean) {
  await updateDoc(doc(db, 'habits', habitId), {
    progress,
    streak,
    lastWatered: hasCurrentLog ? serverTimestamp() : null,
  });
}

export async function finishHabitChallenge(habitId: string, isWon: boolean, finalScore: number) {
  await updateDoc(doc(db, 'habits', habitId), {
    status: isWon ? 'completed' : 'abandoned',
    incorporated: isWon,
    finalScore,
    finishedAt: serverTimestamp(),
  });
}
