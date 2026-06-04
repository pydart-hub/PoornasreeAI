import { Request, Response } from "express";
import prisma from "../lib/prisma";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { isProductCategory, sortByCategory } from "../constants/productCategories";

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

/** Convert an uploaded image to JPEG (WhatsApp only supports jpeg/png). Returns the new filename. */
async function convertToJpeg(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.filename).toLowerCase();
  // Already jpeg/jpg — no conversion needed
  if (ext === ".jpg" || ext === ".jpeg") return file.filename;
  // Already png — WhatsApp supports this too
  if (ext === ".png") return file.filename;

  const newFilename = file.filename.replace(/\.[^.]+$/, ".jpg");
  const inputPath = path.join(UPLOADS_DIR, file.filename);
  const outputPath = path.join(UPLOADS_DIR, newFilename);

  await sharp(inputPath).jpeg({ quality: 85 }).toFile(outputPath);
  // Remove original non-jpeg file
  fs.unlink(inputPath, () => {});
  return newFilename;
}

function parseCategory(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isProductCategory(raw) ? raw : "other";
}

// GET /api/admin/products — list all products
export async function listProducts(_req: Request, res: Response): Promise<void> {
  const products = sortByCategory(await prisma.product.findMany());
  res.json({ products });
}

// POST /api/admin/products — create a product (multipart: image file + JSON fields)
export async function createProduct(req: Request, res: Response): Promise<void> {
  const { name, detail, price, contactNumber, displayOrder, category } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "Product name is required" });
    return;
  }

  const imageFilename = req.file ? await convertToJpeg(req.file) : null;
  const imageUrl = imageFilename ? `/uploads/${imageFilename}` : null;

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      category: parseCategory(category),
      detail: detail?.trim() || null,
      price: price?.trim() || null,
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
  const { name, detail, price, contactNumber, displayOrder, isActive, category } = req.body;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const imageFilename = req.file ? await convertToJpeg(req.file) : undefined;
  const imageUrl = imageFilename ? `/uploads/${imageFilename}` : undefined;

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(category !== undefined && { category: parseCategory(category) }),
      ...(detail !== undefined && { detail: detail?.trim() || null }),
      ...(price !== undefined && { price: price?.trim() || null }),
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
