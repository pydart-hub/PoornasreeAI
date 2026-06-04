-- Add category to products (lactosure | lactogrand | other)
ALTER TABLE "Product" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';
