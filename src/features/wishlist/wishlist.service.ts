import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { CreateWishlistItemInput, WishlistItemRecord, WishlistStatus } from './wishlist.types';

export function subscribeToHouseholdWishlist(
  householdId: string,
  onItems: (items: WishlistItemRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  const wishlistQuery = query(
    collection(db, 'wishlistItems'),
    where('householdId', '==', householdId),
  );

  return onSnapshot(
    wishlistQuery,
    snapshot => {
      const items = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as WishlistItemRecord))
        .sort((a, b) => {
          const statusWeight = getStatusWeight(a.status) - getStatusWeight(b.status);
          if (statusWeight !== 0) return statusWeight;
          return Number(a.priority || 999) - Number(b.priority || 999);
        });
      onItems(items);
    },
    onError,
  );
}

export async function createWishlistItem(input: CreateWishlistItemInput) {
  await addDoc(collection(db, 'wishlistItems'), {
    uid: input.uid,
    householdId: input.householdId,
    title: input.title.trim(),
    estimatedPrice: Number(input.estimatedPrice || 0),
    currency: input.currency || 'ARS',
    priority: Number(input.priority || 3),
    reason: input.reason.trim(),
    category: input.category.trim() || 'Otros',
    status: 'wanted',
    visibility: input.visibility,
    owner: input.owner,
    link: input.link || '',
    notes: input.notes || '',
    tags: input.tags || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateWishlistItem(itemId: string, input: Partial<CreateWishlistItemInput> & { status?: WishlistStatus }) {
  await updateDoc(doc(db, 'wishlistItems', itemId), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWishlistItem(itemId: string) {
  await deleteDoc(doc(db, 'wishlistItems', itemId));
}

function getStatusWeight(status: WishlistStatus) {
  if (status === 'approved') return 0;
  if (status === 'evaluating') return 1;
  if (status === 'wanted') return 2;
  if (status === 'purchased') return 3;
  return 4;
}
