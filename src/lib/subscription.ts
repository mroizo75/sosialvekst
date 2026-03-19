import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SubscriptionStatus = "active" | "inactive" | "past_due" | "canceled" | "trialing";

export type UserSubscription = {
  planCode: string;
  extraPostsPerWeek: number;
  status: SubscriptionStatus;
};

const ACTIVE_STATUSES: SubscriptionStatus[] = ["active", "trialing"];

export const getLatestSubscription = async (userId: string): Promise<UserSubscription | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_code, extra_posts_per_week, status")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toAppError("SUBSCRIPTION_FETCH_FAILED", "Kunne ikke hente abonnement", error.message);
  }

  if (!data) {
    return null;
  }

  return {
    planCode: String(data.plan_code ?? "base_3x4"),
    extraPostsPerWeek: Number(data.extra_posts_per_week ?? 0),
    status: (String(data.status ?? "inactive") as SubscriptionStatus),
  };
};

export const hasActiveSubscription = (subscription: UserSubscription | null): boolean => {
  if (!subscription) return false;
  return ACTIVE_STATUSES.includes(subscription.status);
};

export const getPostsPerWeekAllowance = (subscription: UserSubscription | null): number => {
  const base = 3;
  if (!subscription) return base;
  return base + Math.max(0, subscription.extraPostsPerWeek);
};

export const requireActiveSubscription = async (userId: string): Promise<UserSubscription> => {
  const subscription = await getLatestSubscription(userId);
  if (!subscription || !hasActiveSubscription(subscription)) {
    throw toAppError(
      "SUBSCRIPTION_REQUIRED",
      "Aktivt abonnement kreves for publisering. Du kan fortsatt planlegge innhold.",
    );
  }
  return subscription;
};

