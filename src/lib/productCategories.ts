/** Product catalogue categories (mirrors api/src/constants/productCategories.ts). */
export const PRODUCT_CATEGORIES = {
  lactosure: { key: "lactosure", label: "LactoSure Models", order: 1 },
  lactogrand: { key: "lactogrand", label: "LactoGrand Models", order: 2 },
  other: { key: "other", label: "Other Products", order: 3 },
} as const;

export type ProductCategory = keyof typeof PRODUCT_CATEGORIES;

export const PRODUCT_CATEGORY_KEYS: ProductCategory[] = ["lactosure", "lactogrand", "other"];

export function getCategoryLabel(key: string): string {
  if (key in PRODUCT_CATEGORIES) return PRODUCT_CATEGORIES[key as ProductCategory].label;
  return key;
}

export function sortByCategory<T extends { category: string; displayOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderA = a.category in PRODUCT_CATEGORIES
      ? PRODUCT_CATEGORIES[a.category as ProductCategory].order
      : 99;
    const orderB = b.category in PRODUCT_CATEGORIES
      ? PRODUCT_CATEGORIES[b.category as ProductCategory].order
      : 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.displayOrder - b.displayOrder;
  });
}
