import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { buildJournalEntryPayload } from './journal.helpers';
import type { CreateJournalEntryInput, JournalEntryRecord, UpdateJournalEntryInput } from './journal.types';

export function subscribeToUserJournalEntries(
  uid: string,
  onEntries: (entries: JournalEntryRecord[]) => void,
  onError: (error: unknown) => void,
) {
  const journalQuery = query(
    collection(db, 'thoughts'),
    where('uid', '==', uid),
    orderBy('timestamp', 'desc'),
  );

  return onSnapshot(
    journalQuery,
    (snapshot) => {
      onEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntryRecord)));
    },
    onError,
  );
}

export async function createJournalEntry(input: CreateJournalEntryInput) {
  await addDoc(collection(db, 'thoughts'), buildJournalEntryPayload(input));
}

export async function updateJournalEntry(input: UpdateJournalEntryInput) {
  await updateDoc(doc(db, 'thoughts', input.id), {
    content: input.content,
    categories: input.categories,
    updatedAt: new Date(),
  });
}

export async function deleteJournalEntry(id: string) {
  await deleteDoc(doc(db, 'thoughts', id));
}
