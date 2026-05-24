import { toLegacyPredefinedCategories } from '../features/finance/finance.taxonomy';

export interface SubCategory {
  name: string;
  isDefault?: boolean;
  isArchived?: boolean;
  sortOrder?: number;
  metadata?: {
    vehicleCostType?: 'tenencia' | 'uso';
  };
  subCategories?: (string | SubCategory)[];
}

export interface Category {
  name: string;
  icon: string;
  color: string;
  kind?: 'expense' | 'income' | 'neutral';
  reportGroup?: string;
  isDefault?: boolean;
  isArchived?: boolean;
  sortOrder?: number;
  subCategories: (string | SubCategory)[];
}

export const PREDEFINED_CATEGORIES: Category[] = toLegacyPredefinedCategories();
