import { addDoc, collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { TravelTrip } from './travel.types';

export function subscribeToHouseholdTravelTrips(
  householdId: string,
  onTrips: (trips: TravelTrip[]) => void,
  onError?: (error: unknown) => void,
) {
  const travelQuery = query(
    collection(db, 'travelTrips'),
    where('householdId', '==', householdId),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    travelQuery,
    snapshot => onTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TravelTrip))),
    onError,
  );
}

export async function createTravelTrip(input: Omit<TravelTrip, 'id' | 'createdAt'>) {
  return addDoc(collection(db, 'travelTrips'), {
    ...input,
    createdAt: new Date(),
  });
}
