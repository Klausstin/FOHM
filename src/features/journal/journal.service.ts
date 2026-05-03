import { addDoc, collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { buildJournalEntryPayload } from './journal.helpers';
import type { CreateJournalEntryInput, JournalEntryRecord } from './journal.types';

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
