export interface GoalRecord {
  id: string;
  uid: string;
  householdId?: string | null;
  year: number;
  title: string;
  description?: string;
  categories: string[];
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: any;
}

export interface GoalCommentRecord {
  id: string;
  goalId: string;
  uid: string;
  userName: string;
  userPhoto: string;
  content: string;
  createdAt: any;
}

export interface CreateGoalInput {
  uid: string;
  householdId?: string | null;
  year: number;
  title: string;
  description?: string;
  categories: string[];
}

export interface CreateGoalCommentInput {
  goalId: string;
  uid: string;
  userName: string;
  userPhoto: string;
  content: string;
}
