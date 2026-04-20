import { Request, Response } from "express";
import prisma from "../lib/prisma";

// GET /api/admin/products — list all products
export async function listProducts(_req: Request, res: Response): Promise<void> {
  const products = await prisma.product.findMany({ orderBy: { displayOrder: "asc" } });
  res.json({ products });
}

// POST /api/admin/products — create a product (multipart: image file + JSON fields)
export async function createProduct(req: Request, res: Response): Promise<void> {
  const { name, detail, contactNumber, displayOrder } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "Product name is required" });
    return;
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      detail: detail?.trim() || null,
      imageUrl,
      contactNumber: contactNumber?.trim() || null,
      displayOrder: displayOrder ? parseInt(displayOrder, 10) : 0,
    },
  });
  res.status(201).json({ product });
}

// PATCH /api/admin/products/:id — update a product
export async function updateProduct(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { name, detail, contactNumber, displayOrder, isActive } = req.body;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(detail !== undefined && { detail: detail?.trim() || null }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(contactNumber !== undefined && { contactNumber: contactNumber?.trim() || null }),
      ...(displayOrder !== undefined && { displayOrder: parseInt(displayOrder, 10) }),
      ...(isActive !== undefined && { isActive: isActive === true || isActive === "true" }),
    },
  });
  res.json({ product: updated });
}

// DELETE /api/admin/products/:id — delete a product
export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  await prisma.product.delete({ where: { id } });
  res.json({ message: "Product deleted" });
}
