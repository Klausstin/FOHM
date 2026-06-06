import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { CreateTaskInput, TaskRecord, TaskStatus } from './task.types';

export function subscribeToHouseholdTasks(
  uid: string,
  householdId: string,
  onTasks: (tasks: TaskRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  const ownTasksQuery = query(
    collection(db, 'tasks'),
    where('uid', '==', uid),
  );
  const sharedTasksQuery = query(
    collection(db, 'tasks'),
    where('householdId', '==', householdId),
    where('visibility', 'in', ['shared_with_partner', 'household_shared']),
  );

  const state = new Map<string, TaskRecord>();
  const emit = () => onTasks(Array.from(state.values()).sort(sortTasksForDailyUse));
  const handleSnapshot = (snapshot: any) => {
    snapshot.docChanges().forEach((change: any) => {
      if (change.type === 'removed') {
        state.delete(change.doc.id);
      } else {
        state.set(change.doc.id, { id: change.doc.id, ...change.doc.data() } as TaskRecord);
      }
    });
    emit();
  };

  const unsubscribeOwn = onSnapshot(
    ownTasksQuery,
    handleSnapshot,
    onError,
  );
  const unsubscribeShared = onSnapshot(sharedTasksQuery, handleSnapshot, onError);

  return () => {
    unsubscribeOwn();
    unsubscribeShared();
  };
}

export async function createTask(input: CreateTaskInput) {
  await addDoc(collection(db, 'tasks'), {
    uid: input.uid,
    householdId: input.householdId,
    title: input.title.trim(),
    notes: input.notes?.trim() || '',
    status: input.status || 'inbox',
    importance: input.importance || 'medium',
    urgency: input.urgency || 'medium',
    owner: input.owner || 'agustin',
    visibility: input.visibility || 'private',
    dueDate: input.dueDate || '',
    linkedGoalId: input.linkedGoalId || '',
    projectId: input.projectId || '',
    tags: input.tags || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateTask(taskId: string, input: Partial<CreateTaskInput> & { status?: TaskStatus }) {
  await updateDoc(doc(db, 'tasks', taskId), {
    ...input,
    updatedAt: serverTimestamp(),
    ...(input.status === 'done' ? { completedAt: serverTimestamp() } : {}),
  });
}

export async function deleteTask(taskId: string) {
  await deleteDoc(doc(db, 'tasks', taskId));
}

function sortTasksForDailyUse(a: TaskRecord, b: TaskRecord) {
  const status = getStatusWeight(a.status) - getStatusWeight(b.status);
  if (status !== 0) return status;
  const decision = getDecisionWeight(a) - getDecisionWeight(b);
  if (decision !== 0) return decision;
  return String(a.dueDate || '9999-99-99').localeCompare(String(b.dueDate || '9999-99-99'));
}

function getStatusWeight(status: TaskStatus) {
  if (status === 'next') return 0;
  if (status === 'inbox') return 1;
  if (status === 'scheduled') return 2;
  if (status === 'waiting') return 3;
  if (status === 'done') return 4;
  return 5;
}

function getDecisionWeight(task: TaskRecord) {
  if (task.importance === 'high' && task.urgency === 'high') return 0;
  if (task.importance === 'high') return 1;
  if (task.urgency === 'high') return 2;
  return 3;
}
