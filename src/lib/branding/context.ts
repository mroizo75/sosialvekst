import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BrandContext, ProductImage } from "@/lib/types";

type ProfileRow = {
  company_name: string | null;
};

type BrandProfileRow = {
  target_audience: string | null;
  brand_voice: string | null;
  key_messages: string[] | null;
  logo_url: string | null;
  website_url: string | null;
  website_content: string | null;
  company_description: string | null;
  industry: string | null;
  founded_year: string | null;
  team_description: string | null;
  core_values: string[] | null;
  customer_pain_points: string[] | null;
  customer_success_stories: string[] | null;
  products: string[] | null;
  services: string[] | null;
  unique_selling_points: string[] | null;
  price_range: string | null;
  brand_personality: string | null;
  brand_dos_and_donts: string | null;
  competitor_differentiators: string | null;
  common_questions: string[] | null;
  seasonal_focus: string | null;
};

type ProductImageRow = {
  id: string;
  product_name: string;
  image_url: string;
  sort_order: number;
};

const BRAND_FIELDS = [
  "target_audience", "brand_voice", "key_messages", "logo_url",
  "website_url", "website_content", "company_description",
  "industry", "founded_year", "team_description", "core_values",
  "customer_pain_points", "customer_success_stories",
  "products", "services", "unique_selling_points", "price_range",
  "brand_personality", "brand_dos_and_donts",
  "competitor_differentiators", "common_questions", "seasonal_focus",
].join(", ");

const toStringArray = (value: unknown): string[] | undefined => {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
};

const fetchProductImages = async (
  userId: string,
  workspaceId: string | undefined,
): Promise<ProductImage[]> => {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("product_images")
    .select("id, product_name, image_url, sort_order")
    .eq("user_id", userId)
    .order("product_name")
    .order("sort_order", { ascending: true });

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  return (data as ProductImageRow[]).map((row) => ({
    id: row.id,
    productName: row.product_name,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
  }));
};

export const getBrandContext = async (userId: string, workspaceId?: string): Promise<BrandContext> => {
  const supabase = await createSupabaseServerClient();

  let brandQuery = supabase.from("brand_profiles").select(BRAND_FIELDS).eq("user_id", userId);
  if (workspaceId) brandQuery = brandQuery.eq("workspace_id", workspaceId);

  const [profileResult, brandResult, productImages] = await Promise.all([
    supabase.from("profiles").select("company_name").eq("user_id", userId).maybeSingle(),
    brandQuery.maybeSingle(),
    fetchProductImages(userId, workspaceId),
  ]);

  const profile = profileResult.data as ProfileRow | null;
  const brand = brandResult.data as BrandProfileRow | null;

  return {
    companyName: profile?.company_name ?? undefined,
    companyDescription: brand?.company_description ?? undefined,
    industry: brand?.industry ?? undefined,
    foundedYear: brand?.founded_year ?? undefined,
    teamDescription: brand?.team_description ?? undefined,
    coreValues: toStringArray(brand?.core_values),
    targetAudience: brand?.target_audience ?? undefined,
    customerPainPoints: toStringArray(brand?.customer_pain_points),
    customerSuccessStories: toStringArray(brand?.customer_success_stories),
    products: toStringArray(brand?.products),
    services: toStringArray(brand?.services),
    uniqueSellingPoints: toStringArray(brand?.unique_selling_points),
    priceRange: brand?.price_range ?? undefined,
    brandVoice: brand?.brand_voice ?? undefined,
    brandPersonality: brand?.brand_personality ?? undefined,
    brandDosAndDonts: brand?.brand_dos_and_donts ?? undefined,
    keyMessages: toStringArray(brand?.key_messages),
    competitorDifferentiators: brand?.competitor_differentiators ?? undefined,
    commonQuestions: toStringArray(brand?.common_questions),
    seasonalFocus: brand?.seasonal_focus ?? undefined,
    logoUrl: brand?.logo_url ?? undefined,
    websiteUrl: brand?.website_url ?? undefined,
    websiteContent: brand?.website_content ?? undefined,
    productImages: productImages.length > 0 ? productImages : undefined,
  };
};
