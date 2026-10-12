import type { SupabaseClient } from "@supabase/supabase-js";

import { toAppError } from "@/lib/errors";
import type { OrderContactInput, ProductInput } from "@/lib/products/validation";
import type { OrderContact, Product, ProductImage } from "@/lib/types";

export type ProductOwner = { userId: string; workspaceId: string };

type ContactRow = {
  contact_phone: string | null;
  contact_email: string | null;
  contact_messenger: boolean | null;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  usage_settings: string | null;
  target_audience: string | null;
  benefits: string[] | null;
  product_url: string | null;
  price: number | string | null;
  sale_price: number | string | null;
  workspaces?: ContactRow | ContactRow[] | null;
  product_images?: Array<{ id: string; image_url: string; sort_order: number | null }> | null;
};

const CONTACT_SELECT = "contact_phone, contact_email, contact_messenger";

const PRODUCT_SELECT =
  `id, name, description, usage_settings, target_audience, benefits, product_url, price, sale_price, workspaces(${CONTACT_SELECT}), product_images(id, image_url, sort_order)`;

const toPrice = (value: number | string | null): number | undefined => {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toContact = (row: ContactRow | null | undefined): OrderContact => ({
  phone: row?.contact_phone?.trim() || undefined,
  email: row?.contact_email?.trim() || undefined,
  messenger: row?.contact_messenger ?? true,
});

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  usageSettings: row.usage_settings ?? undefined,
  targetAudience: row.target_audience ?? undefined,
  benefits: row.benefits ?? [],
  productUrl: row.product_url ?? undefined,
  price: toPrice(row.price),
  salePrice: toPrice(row.sale_price),
  contact: toContact(Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces),
  images: (row.product_images ?? [])
    .map((image): ProductImage => ({ id: image.id, imageUrl: image.image_url, sortOrder: image.sort_order ?? 0 }))
    .sort((a, b) => a.sortOrder - b.sortOrder),
});

const toRowValues = (input: ProductInput) => ({
  name: input.name,
  description: input.description ?? null,
  usage_settings: input.usageSettings ?? null,
  target_audience: input.targetAudience ?? null,
  benefits: input.benefits,
  product_url: input.productUrl ?? null,
  price: input.price ?? null,
  sale_price: input.salePrice ?? null,
});

export const getOrderContact = async (client: SupabaseClient, owner: ProductOwner): Promise<OrderContact> => {
  const { data, error } = await client
    .from("workspaces")
    .select(CONTACT_SELECT)
    .eq("id", owner.workspaceId)
    .eq("user_id", owner.userId)
    .maybeSingle();
  if (error) throw toAppError("ORDER_CONTACT_FETCH_FAILED", "Kunne ikke hente bestillingskontakten.", error.message);
  return toContact(data as ContactRow | null);
};

export const updateOrderContact = async (
  client: SupabaseClient,
  owner: ProductOwner,
  input: OrderContactInput,
): Promise<OrderContact> => {
  const { data, error } = await client
    .from("workspaces")
    .update({
      contact_phone: input.phone ?? null,
      contact_email: input.email ?? null,
      contact_messenger: input.messenger,
    })
    .eq("id", owner.workspaceId)
    .eq("user_id", owner.userId)
    .select(CONTACT_SELECT)
    .maybeSingle();
  if (error) throw toAppError("ORDER_CONTACT_UPDATE_FAILED", "Kunne ikke lagre bestillingskontakten.", error.message);
  if (!data) throw toAppError("WORKSPACE_NOT_FOUND", "Fant ikke bedriften.");
  return toContact(data as ContactRow);
};

const isDuplicateName = (message: string): boolean => message.includes("products_workspace_name_unique");

export const listProducts = async (client: SupabaseClient, owner: ProductOwner): Promise<Product[]> => {
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("user_id", owner.userId)
    .eq("workspace_id", owner.workspaceId)
    .order("name");
  if (error) throw toAppError("PRODUCTS_FETCH_FAILED", "Kunne ikke hente produktene.", error.message);
  return ((data ?? []) as ProductRow[]).map(toProduct);
};

export const getProduct = async (
  client: SupabaseClient,
  owner: ProductOwner,
  productId: string,
): Promise<Product | null> => {
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("user_id", owner.userId)
    .eq("workspace_id", owner.workspaceId)
    .maybeSingle();
  if (error) throw toAppError("PRODUCT_FETCH_FAILED", "Kunne ikke hente produktet.", error.message);
  return data ? toProduct(data as ProductRow) : null;
};

export const requireProduct = async (
  client: SupabaseClient,
  owner: ProductOwner,
  productId: string,
): Promise<Product> => {
  const product = await getProduct(client, owner, productId);
  if (!product) throw toAppError("PRODUCT_NOT_FOUND", "Fant ikke produktet i denne bedriften.");
  return product;
};

export const createProduct = async (
  client: SupabaseClient,
  owner: ProductOwner,
  input: ProductInput,
): Promise<Product> => {
  const { data, error } = await client
    .from("products")
    .insert({ user_id: owner.userId, workspace_id: owner.workspaceId, ...toRowValues(input) })
    .select(PRODUCT_SELECT)
    .single();
  if (error) {
    throw isDuplicateName(error.message)
      ? toAppError("PRODUCT_NAME_TAKEN", "Du har allerede et produkt med dette navnet.")
      : toAppError("PRODUCT_CREATE_FAILED", "Kunne ikke lagre produktet.", error.message);
  }
  return toProduct(data as ProductRow);
};

export const updateProduct = async (
  client: SupabaseClient,
  owner: ProductOwner,
  productId: string,
  input: ProductInput,
): Promise<Product> => {
  const { data, error } = await client
    .from("products")
    .update({ ...toRowValues(input), updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("user_id", owner.userId)
    .eq("workspace_id", owner.workspaceId)
    .select(PRODUCT_SELECT)
    .maybeSingle();
  if (error) {
    throw isDuplicateName(error.message)
      ? toAppError("PRODUCT_NAME_TAKEN", "Du har allerede et produkt med dette navnet.")
      : toAppError("PRODUCT_UPDATE_FAILED", "Kunne ikke oppdatere produktet.", error.message);
  }
  if (!data) throw toAppError("PRODUCT_NOT_FOUND", "Fant ikke produktet i denne bedriften.");
  return toProduct(data as ProductRow);
};

export const deleteProduct = async (
  client: SupabaseClient,
  owner: ProductOwner,
  productId: string,
): Promise<void> => {
  const { error } = await client
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("user_id", owner.userId)
    .eq("workspace_id", owner.workspaceId);
  if (error) throw toAppError("PRODUCT_DELETE_FAILED", "Kunne ikke slette produktet.", error.message);
};

export const addProductImage = async (
  client: SupabaseClient,
  owner: ProductOwner,
  input: { productId: string; imageUrl: string },
): Promise<ProductImage> => {
  const product = await requireProduct(client, owner, input.productId);
  const { data, error } = await client
    .from("product_images")
    .insert({
      user_id: owner.userId,
      workspace_id: owner.workspaceId,
      product_id: product.id,
      product_name: product.name,
      image_url: input.imageUrl,
      sort_order: product.images.length,
    })
    .select("id, image_url, sort_order")
    .single();
  if (error) throw toAppError("PRODUCT_IMAGE_CREATE_FAILED", "Kunne ikke lagre produktbildet.", error.message);
  const row = data as { id: string; image_url: string; sort_order: number | null };
  return { id: row.id, imageUrl: row.image_url, sortOrder: row.sort_order ?? 0 };
};

export const deleteProductImage = async (
  client: SupabaseClient,
  owner: ProductOwner,
  imageId: string,
): Promise<void> => {
  const { error } = await client
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("user_id", owner.userId)
    .eq("workspace_id", owner.workspaceId);
  if (error) throw toAppError("PRODUCT_IMAGE_DELETE_FAILED", "Kunne ikke slette produktbildet.", error.message);
};
