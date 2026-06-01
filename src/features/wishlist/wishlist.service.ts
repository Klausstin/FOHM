import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
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
  const priority = input.priority || await getNextWishlistPriority(input.householdId, input.visibility, input.owner);
  await addDoc(collection(db, 'wishlistItems'), {
    uid: input.uid,
    householdId: input.householdId,
    title: input.title.trim(),
    estimatedPrice: Number(input.estimatedPrice || 0),
    currency: input.currency || 'ARS',
    priority,
    reason: input.reason.trim(),
    category: input.category.trim() || 'Otros',
    itemType: input.itemType || 'purchase',
    horizon: input.horizon || 'open',
    targetDate: input.targetDate || '',
    linkedGoalId: input.linkedGoalId || '',
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

async function getNextWishlistPriority(householdId: string, visibility: string, owner: string) {
  const snapshot = await getDocs(query(collection(db, 'wishlistItems'), where('householdId', '==', householdId)));
  const relevantItems = snapshot.docs
    .map(doc => doc.data() as WishlistItemRecord)
    .filter(item =>
      item.status !== 'purchased' &&
      item.status !== 'dismissed' &&
      (visibility === 'private'
        ? item.visibility === 'private' && item.owner === owner
        : item.visibility !== 'private' || item.owner === 'shared')
    );
  return relevantItems.reduce((max, item) => Math.max(max, Number(item.priority || 0)), 0) + 1;
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
