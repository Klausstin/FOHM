export type WishlistVisibility = 'private' | 'shared_with_partner' | 'household_shared';
export type WishlistOwner = 'agustin' | 'vicky' | 'shared' | 'other' | string;
export type WishlistStatus = 'wanted' | 'evaluating' | 'approved' | 'purchased' | 'dismissed';
export type WishlistItemType = 'purchase' | 'big_goal' | 'experience' | 'asset';
export type WishlistHorizon = 'short' | 'medium' | 'long' | 'open';

export interface WishlistItemRecord {
  id: string;
  uid: string;
  householdId: string;
  title: string;
  estimatedPrice: number;
  currency: string;
  priority: number;
  reason: string;
  category: string;
  itemType?: WishlistItemType;
  horizon?: WishlistHorizon;
  targetDate?: string;
  linkedGoalId?: string;
  status: WishlistStatus;
  visibility: WishlistVisibility;
  owner: WishlistOwner;
  link?: string;
  notes?: string;
  tags?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface CreateWishlistItemInput {
  uid: string;
  householdId: string;
  title: string;
  estimatedPrice: number;
  currency: string;
  priority: number;
  reason: string;
  category: string;
  itemType?: WishlistItemType;
  horizon?: WishlistHorizon;
  targetDate?: string;
  linkedGoalId?: string;
  visibility: WishlistVisibility;
  owner: WishlistOwner;
  link?: string;
  notes?: string;
  tags?: string[];
}
