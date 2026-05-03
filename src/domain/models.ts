export type Currency = 'ARS' | 'USD';

export type Visibility =
  | 'private'
  | 'shared_with_partner'
  | 'household_shared'
  | 'app_public';

export type TimestampLike = Date | { toDate: () => Date };

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  timezone: string;
  primaryCurrency: Currency;
  createdAt: TimestampLike;
}

export interface Household {
  id: string;
  name: string;
  ownerId: string;
  createdAt: TimestampLike;
}

export interface HouseholdMember {
  householdId: string;
  userId: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active' | 'removed';
  createdAt: TimestampLike;
}

export interface Attachment {
  id: string;
  type: 'image' | 'audio' | 'file';
  url: string;
  name?: string;
  mimeType?: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  householdId?: string;
  title?: string;
  content: string;
  entryType: 'text' | 'audio' | 'photo' | 'mixed';
  transcript?: string;
  mood?: number;
  energy?: number;
  categories: string[];
  visibility: Visibility;
  attachments: Attachment[];
  createdAt: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface FinancialAccount {
  id: string;
  ownerId: string;
  householdId?: string;
  name: string;
  type: 'bank' | 'wallet' | 'investment' | 'credit_card' | 'cash';
  currency: Currency;
  openingBalance: number;
  currentBalance?: number;
  visibility: Visibility;
  createdAt: TimestampLike;
}

export interface FinancialTransaction {
  id: string;
  accountId: string;
  userId: string;
  householdId?: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: Currency;
  category: string;
  tags: string[];
  note?: string;
  paymentMethod?: string;
  status: 'pending' | 'posted' | 'ignored';
  date: TimestampLike;
  visibility: Visibility;
  createdAt: TimestampLike;
}

export interface InvestmentSnapshot {
  id: string;
  accountId: string;
  investedCapital: number;
  currentValue: number;
  currency: Currency;
  date: TimestampLike;
}

export interface Goal {
  id: string;
  ownerId: string;
  householdId?: string;
  title: string;
  description?: string;
  motivation?: string;
  category: string;
  year: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'paused' | 'abandoned';
  progress: number;
  metricName?: string;
  metricTarget?: number;
  metricCurrent?: number;
  linkedHabitIds: string[];
  visibility: Visibility;
  createdAt: TimestampLike;
}

export interface Habit {
  id: string;
  ownerId: string;
  householdId?: string;
  title: string;
  description?: string;
  category: string;
  frequency: 'daily' | 'weekly' | 'custom';
  status: 'new' | 'maintenance' | 'paused' | 'abandoned';
  quarter: 1 | 2 | 3 | 4;
  year: number;
  linkedGoalIds: string[];
  visibility: Visibility;
  createdAt: TimestampLike;
}

export interface HabitCheckin {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  completed: boolean;
  note?: string;
  createdAt: TimestampLike;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  googleEventId: string;
  title: string;
  start: TimestampLike;
  end: TimestampLike;
  category?: string;
  source: 'google';
  visibility: Visibility;
}

export interface SourceRef {
  collection: string;
  id: string;
  field?: string;
}

export interface AIInsight {
  id: string;
  userId: string;
  householdId?: string;
  type: 'finance' | 'journal' | 'habit' | 'goal' | 'calendar' | 'alignment';
  title: string;
  summary: string;
  recommendations: string[];
  sourceRefs: SourceRef[];
  confidence: 'low' | 'medium' | 'high';
  missingData?: string[];
  createdAt: TimestampLike;
}
