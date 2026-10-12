"use client";

import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import type { Product, ProductImage } from "@/lib/types";

type ProductForm = {
  name: string;
  description: string;
  usageSettings: string;
  targetAudience: string;
  benefits: string;
  productUrl: string;
};

const EMPTY_FORM: ProductForm = {
  name: "",
  description: "",
  usageSettings: "",
  targetAudience: "",
  benefits: "",
  productUrl: "",
};

const MAX_IMAGES = 4;

const toForm = (product: Product): ProductForm => ({
  name: product.name,
  description: product.description ?? "",
  usageSettings: product.usageSettings ?? "",
  targetAudience: product.targetAudience ?? "",
  benefits: product.benefits.join(", "),
  productUrl: product.productUrl ?? "",
});

const toPayload = (form: ProductForm) => ({
  name: form.name.trim(),
  description: form.description,
  usageSettings: form.usageSettings,
  targetAudience: form.targetAudience,
  benefits: form.benefits.split(",").map((item) => item.trim()).filter(Boolean),
  productUrl: form.productUrl.trim(),
});

const readMessage = async (response: Response, fallback: string): Promise<string> => {
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  return data?.message ?? fallback;
};

export const ProductCatalog = () => {
  const { dictionary } = useI18n();
  const p = dictionary.products;
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");

  const loadProducts = useCallback(async () => {
    try {
      const response = await fetch("/api/products");
      if (!response.ok) {
        setStatus(await readMessage(response, p.loadFailed));
        return;
      }
      const data = (await response.json()) as { products: Product[] };
      setProducts(data.products ?? []);
    } catch {
      setStatus(p.loadFailed);
    } finally {
      setLoaded(true);
    }
  }, [p.loadFailed]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const editing = editingId && editingId !== "new" ? products.find((item) => item.id === editingId) : undefined;

  const startNew = () => {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setStatus("");
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setForm(toForm(product));
    setStatus("");
  };

  const closeForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const replaceProduct = (product: Product) => {
    setProducts((prev) => {
      const exists = prev.some((item) => item.id === product.id);
      const next = exists ? prev.map((item) => (item.id === product.id ? product : item)) : [...prev, product];
      return [...next].sort((a, b) => a.name.localeCompare(b.name, "nb"));
    });
  };

  const saveProduct = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setStatus("");
    try {
      const isNew = editingId === "new";
      const response = await fetch(isNew ? "/api/products" : `/api/products/${editingId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      if (!response.ok) {
        setStatus(await readMessage(response, p.saveFailed));
        return;
      }
      const product = (await response.json()) as Product;
      replaceProduct(product);
      setEditingId(product.id);
      setForm(toForm(product));
      setStatus(p.saved);
    } catch {
      setStatus(p.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async (product: Product) => {
    if (!window.confirm(p.deleteConfirm.replace("{name}", product.name))) return;
    const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus(await readMessage(response, p.deleteFailed));
      return;
    }
    setProducts((prev) => prev.filter((item) => item.id !== product.id));
    if (editingId === product.id) closeForm();
  };

  const uploadImage = async (product: Product, file: File) => {
    setUploading(true);
    setStatus("");
    try {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("mediaKind", "image");
      const upload = await fetch("/api/media/upload", { method: "POST", body: payload });
      if (!upload.ok) {
        setStatus(await readMessage(upload, p.uploadFailed));
        return;
      }
      const { publicUrl } = (await upload.json()) as { publicUrl: string };
      const saved = await fetch("/api/products/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, imageUrl: publicUrl }),
      });
      if (!saved.ok) {
        setStatus(await readMessage(saved, p.uploadFailed));
        return;
      }
      const image = (await saved.json()) as ProductImage;
      replaceProduct({ ...product, images: [...product.images, image] });
    } catch {
      setStatus(p.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (product: Product, imageId: string) => {
    const response = await fetch("/api/products/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: imageId }),
    });
    if (!response.ok) {
      setStatus(await readMessage(response, p.saveFailed));
      return;
    }
    replaceProduct({ ...product, images: product.images.filter((image) => image.id !== imageId) });
  };

  const update = (key: keyof ProductForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      {products.length === 0 && editingId === null ? (
        <p className="text-sm text-muted-foreground">{p.empty}</p>
      ) : null}

      <ul className="space-y-2">
        {products.map((product) => (
          <li key={product.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex shrink-0 -space-x-2">
              {product.images.slice(0, 3).map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={image.imageUrl}
                  alt={product.name}
                  className="size-10 rounded-lg border-2 border-card object-cover"
                />
              ))}
              {product.images.length === 0 ? (
                <div className="flex size-10 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                  {p.noImages}
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {product.usageSettings ?? product.description ?? p.imageCount.replace("{count}", String(product.images.length))}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => startEdit(product)}>
              {p.edit}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void removeProduct(product)}>
              {p.delete}
            </Button>
          </li>
        ))}
      </ul>

      {editingId === null ? (
        <Button variant="outline" size="sm" onClick={startNew}>
          {p.add}
        </Button>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
          <Input
            label={p.nameLabel}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder={p.namePlaceholder}
            required
          />
          <Textarea
            label={p.descriptionLabel}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder={p.descriptionPlaceholder}
            rows={2}
          />
          <Textarea
            label={p.usageLabel}
            value={form.usageSettings}
            onChange={(e) => update("usageSettings", e.target.value)}
            placeholder={p.usagePlaceholder}
            hint={p.usageHint}
            rows={3}
          />
          <Input
            label={p.audienceLabel}
            value={form.targetAudience}
            onChange={(e) => update("targetAudience", e.target.value)}
            placeholder={p.audiencePlaceholder}
          />
          <Input
            label={p.benefitsLabel}
            value={form.benefits}
            onChange={(e) => update("benefits", e.target.value)}
            placeholder={p.benefitsPlaceholder}
            hint={p.benefitsHint}
          />
          <Input
            label={p.urlLabel}
            type="url"
            value={form.productUrl}
            onChange={(e) => update("productUrl", e.target.value)}
            placeholder={p.urlPlaceholder}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{p.imagesLabel}</p>
            {editing ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {editing.images.map((image) => (
                    <div key={image.id} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.imageUrl}
                        alt={editing.name}
                        className="size-16 rounded-lg border border-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => void removeImage(editing, image.id)}
                        aria-label={p.removeImage}
                        className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white group-hover:flex"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {editing.images.length < MAX_IMAGES ? (
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) void uploadImage(editing, selected);
                      e.target.value = "";
                    }}
                    className="block text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary-hover disabled:opacity-50"
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">{uploading ? p.uploading : p.imagesHint}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{p.imagesAfterSave}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={() => void saveProduct()} disabled={saving || !form.name.trim()}>
              {saving ? p.saving : p.save}
            </Button>
            <Button variant="outline" size="sm" onClick={closeForm} disabled={saving}>
              {p.close}
            </Button>
          </div>
        </div>
      )}

      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </div>
  );
};
