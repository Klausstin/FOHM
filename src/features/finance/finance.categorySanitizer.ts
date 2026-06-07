import { toLegacyPredefinedCategories } from './finance.taxonomy';

const BLOCKED_TEST_CATEGORY_NAMES = new Set(['hola prueba', 'hola, prueba']);

export function normalizeCategoryLabel(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeFinanceCategories<T extends Record<string, any>>(categories: T[]): T[] {
  const sanitized = categories
    .filter(category => !BLOCKED_TEST_CATEGORY_NAMES.has(normalizeCategoryLabel(category.name || '')))
    .map(category => ({
      ...category,
      subCategories: (category.subCategories || []).filter((subcategory: any) => {
        const name = typeof subcategory === 'string' ? subcategory : subcategory?.name;
        return !BLOCKED_TEST_CATEGORY_NAMES.has(normalizeCategoryLabel(name || ''));
      }),
    }));

  return mergeDefaultFinanceSubcategories(sanitized) as T[];
}

function mergeDefaultFinanceSubcategories(categories: Record<string, any>[]) {
  const defaults = toLegacyPredefinedCategories();
  const byName = new Map(categories.map(category => [normalizeCategoryLabel(category.name || ''), category]));

  for (const defaultCategory of defaults) {
    const key = normalizeCategoryLabel(defaultCategory.name);
    const existing = byName.get(key);
    if (!existing) {
      categories.push(defaultCategory);
      byName.set(key, defaultCategory);
      continue;
    }

    const existingSubcategoryNames = new Set(
      (existing.subCategories || []).map((subcategory: any) =>
        normalizeCategoryLabel(typeof subcategory === 'string' ? subcategory : subcategory?.name || ''),
      ),
    );
    const missingSubcategories = (defaultCategory.subCategories || [])
      .filter((subcategory: any) => !existingSubcategoryNames.has(normalizeCategoryLabel(subcategory.name || subcategory)));

    if (missingSubcategories.length > 0) {
      existing.subCategories = [...(existing.subCategories || []), ...missingSubcategories];
    }
  }

  return categories;
}
