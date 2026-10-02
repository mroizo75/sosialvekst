import type { SupabaseClient } from "@supabase/supabase-js";

import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type WorkspaceSubscriptionInput = {
  userId: string;
  workspaceId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  planCode?: string;
  extraPostsPerWeek?: number;
  status: "active" | "past_due" | "canceled";
};

export const planForMode = (mode: string | undefined): { planCode: string; extraPostsPerWeek: number } =>
  mode === "extra_posts" ? { planCode: "extra_5x4", extraPostsPerWeek: 2 } : { planCode: "base_3x4", extraPostsPerWeek: 0 };

// Checkouts made before billing was per business carry no workspaceId; they belong to the default business.
export const resolveCheckoutWorkspace = async (
  supabase: SupabaseClient,
  userId: string,
  metadata: Record<string, string> | null | undefined,
): Promise<string> => {
  const requested = metadata?.workspaceId;
  let query = supabase.from("workspaces").select("id").eq("user_id", userId);
  query = requested ? query.eq("id", requested) : query.order("is_default", { ascending: false }).order("created_at", { ascending: true });
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw toAppError("WORKSPACE_LOOKUP_FAILED", "Kunne ikke finne bedriften for betalingen.", error.message);
  if (!data?.id) {
    throw toAppError("WORKSPACE_NOT_FOUND", "Fant ikke bedriften betalingen gjelder.", { userId, requested: requested ?? null });
  }
  return data.id as string;
};

export const saveWorkspaceSubscription = async (
  supabase: SupabaseClient,
  input: WorkspaceSubscriptionInput,
): Promise<void> => {
  const row = {
    user_id: input.userId,
    workspace_id: input.workspaceId,
    stripe_customer_id: input.stripeCustomerId ?? "",
    stripe_subscription_id: input.stripeSubscriptionId ?? "",
    plan_code: input.planCode ?? "base_3x4",
    extra_posts_per_week: input.extraPostsPerWeek ?? 0,
    status: input.status,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: readError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .limit(1)
    .maybeSingle();
  if (readError) throw toAppError("SUBSCRIPTION_READ_FAILED", "Kunne ikke lese abonnement.", readError.message);

  const { error } = existing?.id
    ? await supabase.from("subscriptions").update(row).eq("id", existing.id as string)
    : await supabase.from("subscriptions").insert(row);
  if (error) throw toAppError("SUBSCRIPTION_SAVE_FAILED", "Kunne ikke lagre abonnement.", error.message);

  logger.info("Abonnement lagret for bedrift", {
    userId: input.userId,
    workspaceId: input.workspaceId,
    planCode: row.plan_code,
    status: row.status,
  });
};
