/** Product catalogue categories (admin + WhatsApp). */
export const PRODUCT_CATEGORIES = {
  lactosure: { key: "lactosure", label: "LactoSure Models", order: 1 },
  lactogrand: { key: "lactogrand", label: "LactoGrand Models", order: 2 },
  other: { key: "other", label: "Other Products", order: 3 },
} as const;

export type ProductCategory = keyof typeof PRODUCT_CATEGORIES;

export const PRODUCT_CATEGORY_KEYS: ProductCategory[] = ["lactosure", "lactogrand", "other"];

export function isProductCategory(value: string): value is ProductCategory {
  return PRODUCT_CATEGORY_KEYS.includes(value as ProductCategory);
}

export function getCategoryLabel(key: string): string {
  if (isProductCategory(key)) return PRODUCT_CATEGORIES[key].label;
  return key;
}

export function sortByCategory<T extends { category: string; displayOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderA = isProductCategory(a.category) ? PRODUCT_CATEGORIES[a.category].order : 99;
    const orderB = isProductCategory(b.category) ? PRODUCT_CATEGORIES[b.category].order : 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.displayOrder - b.displayOrder;
  });
}
