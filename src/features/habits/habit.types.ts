export interface HabitRecord {
  id: string;
  uid: string;
  householdId?: string | null;
  title: string;
  description: string;
  startDate?: string;
  progress: number;
  streak: number;
  lastWatered?: any;
  incorporated: boolean;
  status: 'active' | 'completed' | 'abandoned';
  linkedGoalIds?: string[];
  finalScore?: number;
  finishedAt?: any;
  createdAt: any;
}

export interface HabitLogRecord {
  id: string;
  habitId: string;
  uid: string;
  date: string;
  status: 'green' | 'yellow' | 'red';
  timestamp: any;
}

export interface CreateHabitInput {
  uid: string;
  householdId?: string | null;
  title: string;
  description: string;
  startDate: string;
  linkedGoalIds: string[];
}
