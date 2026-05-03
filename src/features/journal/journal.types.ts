import type { Visibility } from '../../domain/models';

export interface JournalReflection {
  emotions: string;
  explanation: string;
  highlights: string;
  productivity: string;
}

export interface SelectedJournalImage {
  data: string;
  type: string;
}

export interface JournalEntryRecord {
  id: string;
  uid: string;
  householdId?: string | null;
  content: string;
  categories: string[];
  visibility?: Visibility;
  entryType?: 'text' | 'audio' | 'photo' | 'mixed';
  attachments?: unknown[];
  timestamp: any;
  imageUrl?: string | null;
  analysis?: string | null;
}

export interface CreateJournalEntryInput {
  uid: string;
  householdId?: string | null;
  content: string;
  categories: string[];
  image?: SelectedJournalImage | null;
  imageAnalysis?: string | null;
}

export interface UpdateJournalEntryInput {
  id: string;
  content: string;
  categories: string[];
}
