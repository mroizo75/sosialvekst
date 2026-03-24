import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 5;

type AiEditLimits = {
  used: number;
  limit: number;
};

export const getAiEditLimits = async (userId: string, workspaceId?: string): Promise<AiEditLimits> => {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("content_plans")
    .select("ai_edits_used, ai_edits_limit")
    .eq("user_id", userId);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { used: 0, limit: DEFAULT_LIMIT };
  }

  return {
    used: (data.ai_edits_used as number) ?? 0,
    limit: (data.ai_edits_limit as number) ?? DEFAULT_LIMIT,
  };
};

export const checkAiEditAvailable = async (userId: string, workspaceId?: string): Promise<AiEditLimits> => {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("content_plans")
    .select("id, ai_edits_used, ai_edits_limit")
    .eq("user_id", userId);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data: plan } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    throw toAppError("NO_PLAN", "Ingen innholdsplan funnet.");
  }

  const used = (plan.ai_edits_used as number) ?? 0;
  const limit = (plan.ai_edits_limit as number) ?? DEFAULT_LIMIT;

  if (used >= limit) {
    const err = toAppError(
      "AI_EDIT_LIMIT_REACHED",
      `Du har brukt opp dine ${limit} AI-endringer for denne perioden. Rediger tekst og bilder manuelt.`,
    );
    throw Object.assign(new Error(err.message), err);
  }

  return { used, limit };
};

export const consumeAiEdit = async (userId: string, workspaceId?: string): Promise<AiEditLimits> => {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("content_plans")
    .select("id, ai_edits_used, ai_edits_limit")
    .eq("user_id", userId);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data: plan } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    throw toAppError("NO_PLAN", "Ingen innholdsplan funnet.");
  }

  const used = ((plan.ai_edits_used as number) ?? 0) + 1;
  const limit = (plan.ai_edits_limit as number) ?? DEFAULT_LIMIT;

  if (used > limit) {
    const err = toAppError(
      "AI_EDIT_LIMIT_REACHED",
      `Du har brukt opp dine ${limit} AI-endringer for denne perioden. Rediger tekst og bilder manuelt.`,
    );
    throw Object.assign(new Error(err.message), err);
  }

  await supabase
    .from("content_plans")
    .update({ ai_edits_used: used })
    .eq("id", plan.id as string)
    .eq("user_id", userId);

  return { used, limit };
};
