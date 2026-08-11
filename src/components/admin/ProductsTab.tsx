"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, Search, Package, Pencil, Power, X, Upload, Phone } from "lucide-react";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_KEYS,
  getCategoryLabel,
  sortByCategory,
  type ProductCategory,
} from "@/lib/productCategories";

interface Product {
  id: string;
  name: string;
  category: string;
  detail?: string | null;
  price?: string | null;
  imageUrl?: string | null;
  contactNumber?: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

const DEFAULT_CATEGORY: ProductCategory = "lactosure";

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export default function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create form
  const [form, setForm] = useState({
    name: "",
    category: DEFAULT_CATEGORY,
    detail: "",
    price: "",
    contactNumber: "",
    displayOrder: "0",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Edit modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: DEFAULT_CATEGORY,
    detail: "",
    price: "",
    contactNumber: "",
    displayOrder: "0",
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete / toggle
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ products: Product[] }>("/api/admin/products");
      setProducts(data.products);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // ── Create ──
  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError("Product name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("category", form.category);
      fd.append("detail", form.detail);
      fd.append("price", form.price);
      fd.append("contactNumber", form.contactNumber);
      fd.append("displayOrder", form.displayOrder);
      if (imageFile) fd.append("image", imageFile);

      await apiFetch("/api/admin/products", { method: "POST", body: fd });
      setForm({
        name: "",
        category: DEFAULT_CATEGORY,
        detail: "",
        price: "",
        contactNumber: "",
        displayOrder: "0",
      });
      setImageFile(null);
      setImagePreview(null);
      fetchProducts();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  // ── Delete ──
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/admin/products/${id}`, { method: "DELETE" });
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  // ── Toggle Active ──
  const handleToggleActive = async (p: Product) => {
    setTogglingId(p.id);
    try {
      const fd = new FormData();
      fd.append("isActive", String(!p.isActive));
      await apiFetch(`/api/admin/products/${p.id}`, { method: "PATCH", body: fd });
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
    } catch { /* ignore */ }
    setTogglingId(null);
  };

  // ── Edit ──
  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setEditForm({
      name: p.name,
      category: (PRODUCT_CATEGORY_KEYS.includes(p.category as ProductCategory)
        ? p.category
        : "other") as ProductCategory,
      detail: p.detail ?? "",
      price: p.price ?? "",
      contactNumber: p.contactNumber ?? "",
      displayOrder: String(p.displayOrder),
    });
    setEditImageFile(null);
    setEditImagePreview(p.imageUrl || null);
    setEditError("");
  };

  const handleEditSave = async () => {
    if (!editingProduct) return;
    if (!editForm.name.trim()) {
      setEditError("Product name is required");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const fd = new FormData();
      fd.append("name", editForm.name);
      fd.append("category", editForm.category);
      fd.append("detail", editForm.detail);
      fd.append("price", editForm.price);
      fd.append("contactNumber", editForm.contactNumber);
      fd.append("displayOrder", editForm.displayOrder);
      if (editImageFile) fd.append("image", editImageFile);

      const data = await apiFetch<{ product: Product }>(`/api/admin/products/${editingProduct.id}`, {
        method: "PATCH",
        body: fd,
      });
      setProducts(prev => prev.map(x => x.id === editingProduct.id ? data.product : x));
      setEditingProduct(null);
    } catch (e) {
      setEditError((e as Error).message);
    }
    setEditSaving(false);
  };

  // ── Image preview helper ──
  const handleImageChange = (file: File | null, setPreview: (v: string | null) => void) => {
    if (!file) { setPreview(null); return; }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");

  const filtered = sortByCategory(
    products.filter(p => {
      if (selectedCategoryFilter !== "all" && p.category !== selectedCategoryFilter) {
        return false;
      }
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.detail ?? "").toLowerCase().includes(q) ||
        getCategoryLabel(p.category).toLowerCase().includes(q)
      );
    }),
  );

  const grouped = PRODUCT_CATEGORY_KEYS.map(key => ({
    key,
    label: PRODUCT_CATEGORIES[key].label,
    items: filtered.filter(p => p.category === key),
  })).filter(g => g.items.length > 0);

  const uncategorized = filtered.filter(
    p => !PRODUCT_CATEGORY_KEYS.includes(p.category as ProductCategory),
  );

  const categorySelect = (value: string, onChange: (v: ProductCategory) => void) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value as ProductCategory)}
      className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
    >
      {PRODUCT_CATEGORY_KEYS.map(key => (
        <option key={key} value={key}>
          {PRODUCT_CATEGORIES[key].label}
        </option>
      ))}
    </select>
  );

  const renderProductCard = (p: Product) => (
    <div key={p.id} className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
      {p.imageUrl ? (
        <img
          src={p.imageUrl}
          alt={p.name}
          className="w-full h-40 object-cover bg-surface-tertiary dark:bg-surface-dark-tertiary"
        />
      ) : (
        <div className="w-full h-40 flex items-center justify-center bg-surface-tertiary dark:bg-surface-dark-tertiary">
          <Package className="w-10 h-10 text-content-secondary/30" />
        </div>
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary dark:text-primary-300">
              {getCategoryLabel(p.category)}
            </p>
            <p className="text-sm font-semibold text-content dark:text-content-dark truncate">{p.name}</p>
            {p.price && (
              <p className="text-sm font-medium text-primary dark:text-primary-300 mt-0.5">{p.price}</p>
            )}
            {p.detail && (
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary line-clamp-2 mt-0.5">
                {p.detail}
              </p>
            )}
          </div>
          <span className="text-xs text-content-secondary shrink-0">#{p.displayOrder}</span>
        </div>
        {p.contactNumber && (
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary flex items-center gap-1">
            <Phone className="w-3 h-3" /> {p.contactNumber}
          </p>
        )}
        <div className="flex items-center gap-1.5 pt-1 border-t border-line dark:border-line-dark">
          <button
            onClick={() => handleToggleActive(p)}
            disabled={togglingId === p.id}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${p.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"} disabled:opacity-50`}
          >
            {togglingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
            {p.isActive ? "Active" : "Inactive"}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => openEditModal(p)}
            className="p-1.5 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleDelete(p.id)}
            disabled={deletingId === p.id}
            className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" /> Products Catalog
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {filtered.length} of {products.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Equipment, milk analyzers, and DPUs available for customer reference.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Category Filter */}
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {PRODUCT_CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {PRODUCT_CATEGORIES[key].label}
              </option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* ── Add Product Form ── */}
      <div className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-3">
        <h3 className="text-sm font-semibold text-content dark:text-content-dark">Add Product</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Product Name *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
          <div>
            <label className="sr-only">Category</label>
            {categorySelect(form.category, v => setForm(f => ({ ...f, category: v })))}
          </div>
          <input
            type="text"
            placeholder="Price (e.g. \u20b925,000)"
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Contact Number"
              value={form.contactNumber}
              onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))}
              className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            />
            <input
              type="number"
              placeholder="Order"
              value={form.displayOrder}
              onChange={e => setForm(f => ({ ...f, displayOrder: e.target.value }))}
              className="w-20 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            />
          </div>
        </div>
        <textarea
          placeholder="Product details / description"
          value={form.detail}
          onChange={e => setForm(f => ({ ...f, detail: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm resize-none"
        />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-line dark:border-line-dark hover:border-primary cursor-pointer text-sm text-content-secondary">
            <Upload className="w-4 h-4" />
            {imageFile ? imageFile.name : "Choose Image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0] ?? null;
                setImageFile(f);
                handleImageChange(f, setImagePreview);
              }}
            />
          </label>
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="h-12 w-12 rounded-lg object-cover border border-line" />
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Product
        </button>
      </div>

      {/* ── Product List ── */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-content-secondary dark:text-content-dark-secondary text-sm">No products found</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(group => (
            <div key={group.key} className="space-y-3">
              <h3 className="text-sm font-semibold text-content dark:text-content-dark border-b border-line dark:border-line-dark pb-2">
                {group.label} ({group.items.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map(renderProductCard)}
              </div>
            </div>
          ))}
          {uncategorized.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-content dark:text-content-dark border-b border-line dark:border-line-dark pb-2">
                Uncategorized ({uncategorized.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {uncategorized.map(renderProductCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-xl border border-line dark:border-line-dark p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-content dark:text-content-dark">Edit Product</h3>
              <button onClick={() => setEditingProduct(null)} className="p-1 rounded-lg hover:bg-surface-hover"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-content-secondary">Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary">Category</label>
                <div className="mt-1">
                  {categorySelect(editForm.category, v => setEditForm(f => ({ ...f, category: v })))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary">Detail</label>
                <textarea
                  value={editForm.detail}
                  onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary">Price</label>
                <input
                  type="text"
                  value={editForm.price}
                  onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="e.g. \u20b925,000"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary">Contact Number</label>
                <input
                  type="text"
                  value={editForm.contactNumber}
                  onChange={e => setEditForm(f => ({ ...f, contactNumber: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary">Display Order</label>
                <input
                  type="number"
                  value={editForm.displayOrder}
                  onChange={e => setEditForm(f => ({ ...f, displayOrder: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary">Image</label>
                <div className="flex items-center gap-3 mt-1">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-line dark:border-line-dark hover:border-primary cursor-pointer text-sm text-content-secondary">
                    <Upload className="w-4 h-4" />
                    {editImageFile ? editImageFile.name : "Change Image"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null;
                        setEditImageFile(f);
                        handleImageChange(f, setEditImagePreview);
                      }}
                    />
                  </label>
                  {editImagePreview && (
                    <img src={editImagePreview} alt="Preview" className="h-12 w-12 rounded-lg object-cover border border-line" />
                  )}
                </div>
              </div>
            </div>
            {editError && <p className="text-xs text-red-500">{editError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 rounded-xl border border-line dark:border-line-dark text-sm hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
              >
                {editSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
