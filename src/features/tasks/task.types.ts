export type TaskStatus = 'inbox' | 'next' | 'scheduled' | 'waiting' | 'done' | 'discarded';
export type TaskImportance = 'low' | 'medium' | 'high';
export type TaskUrgency = 'low' | 'medium' | 'high';
export type TaskOwner = 'agustin' | 'vicky' | 'shared' | 'other';
export type TaskVisibility = 'private' | 'shared_with_partner' | 'household_shared';

export interface TaskRecord {
  id: string;
  uid: string;
  householdId: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  importance: TaskImportance;
  urgency: TaskUrgency;
  owner: TaskOwner | string;
  visibility: TaskVisibility;
  dueDate?: string;
  linkedGoalId?: string;
  projectId?: string;
  tags?: string[];
  createdAt?: any;
  updatedAt?: any;
  completedAt?: any;
}

export interface CreateTaskInput {
  uid: string;
  householdId: string;
  title: string;
  notes?: string;
  status?: TaskStatus;
  importance?: TaskImportance;
  urgency?: TaskUrgency;
  owner?: TaskOwner | string;
  visibility?: TaskVisibility;
  dueDate?: string;
  linkedGoalId?: string;
  projectId?: string;
  tags?: string[];
}
