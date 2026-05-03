import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { CreateGoalCommentInput, CreateGoalInput, GoalCommentRecord, GoalRecord } from './goal.types';

export function subscribeToHouseholdGoals(
  householdId: string,
  year: number,
  onGoals: (goals: GoalRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  const goalsQuery = query(
    collection(db, 'goals'),
    where('householdId', '==', householdId),
    where('year', '==', year),
  );

  return onSnapshot(
    goalsQuery,
    snapshot => onGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GoalRecord))),
    onError,
  );
}

export function subscribeToGoalComments(
  goalId: string,
  onComments: (comments: GoalCommentRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  const commentsQuery = query(
    collection(db, 'goalComments'),
    where('goalId', '==', goalId),
    orderBy('createdAt', 'asc'),
  );

  return onSnapshot(
    commentsQuery,
    snapshot => onComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GoalCommentRecord))),
    onError,
  );
}

export async function createGoal(input: CreateGoalInput) {
  await addDoc(collection(db, 'goals'), {
    uid: input.uid,
    householdId: input.householdId || null,
    year: input.year,
    title: input.title,
    description: input.description || '',
    categories: input.categories,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function updateGoalStatus(goalId: string, status: GoalRecord['status']) {
  await updateDoc(doc(db, 'goals', goalId), { status });
}

export async function deleteGoal(goalId: string) {
  await deleteDoc(doc(db, 'goals', goalId));
}

export async function createGoalComment(input: CreateGoalCommentInput) {
  await addDoc(collection(db, 'goalComments'), {
    ...input,
    createdAt: serverTimestamp(),
  });
}

export async function updateGoalComment(commentId: string, content: string) {
  await updateDoc(doc(db, 'goalComments', commentId), {
    content: content.trim(),
  });
}

export async function deleteGoalComment(commentId: string) {
  await deleteDoc(doc(db, 'goalComments', commentId));
}
