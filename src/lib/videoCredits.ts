import type { SupabaseClient } from "@supabase/supabase-js";

import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type VideoBalance = {
  balance: number;
  totalPurchased: number;
};

export const getVideoBalance = async (
  userId: string,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<VideoBalance> => {
  const { data } = await supabase
    .from("video_credits")
    .select("balance, total_purchased")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    balance: (data?.balance as number) ?? 0,
    totalPurchased: (data?.total_purchased as number) ?? 0,
  };
};

const CONSUME_ATTEMPTS = 3;

const creditsExhausted = () => Object.assign(
  new Error("Ingen videokreditter igjen."),
  toAppError("VIDEO_CREDITS_EXHAUSTED", "Du har ingen videokreditter igjen. Kjøp flere for å generere videoer."),
);

// Compare-and-set on balance so two videos finishing at once cannot both spend the same credit.
export const consumeVideoCredit = async (
  userId: string,
  description: string,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<VideoBalance> => {
  for (let attempt = 1; attempt <= CONSUME_ATTEMPTS; attempt += 1) {
    const { data: row, error: readError } = await supabase
      .from("video_credits")
      .select("id, balance, total_purchased")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw toAppError("VIDEO_CREDITS_READ_FAILED", "Kunne ikke lese videokreditter.", readError.message);

    const currentBalance = (row?.balance as number) ?? 0;
    if (!row?.id || currentBalance <= 0) throw creditsExhausted();

    const newBalance = currentBalance - 1;
    const { data: updated, error: updateError } = await supabase
      .from("video_credits")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", row.id as string)
      .eq("balance", currentBalance)
      .select("id");
    if (updateError) throw toAppError("VIDEO_CREDITS_UPDATE_FAILED", "Kunne ikke trekke videokreditt.", updateError.message);
    if ((updated ?? []).length === 0) continue;

    await recordUsage(supabase, userId, description, newBalance);
    return { balance: newBalance, totalPurchased: (row.total_purchased as number) ?? 0 };
  }
  throw toAppError("VIDEO_CREDITS_BUSY", "Videokreditten kunne ikke trekkes akkurat nå. Prøv igjen.");
};

const recordUsage = async (
  supabase: SupabaseClient,
  userId: string,
  description: string,
  newBalance: number,
): Promise<void> => {
  await supabase.from("video_credit_transactions").insert({
    user_id: userId,
    amount: -1,
    type: "usage",
    description,
  });

  logger.info("[videoCredits] Kreditt brukt", { userId, newBalance, description });
};

export const addVideoCredits = async (
  userId: string,
  amount: number,
  stripeSessionId: string,
): Promise<VideoBalance> => {
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("video_credits")
    .select("id, balance, total_purchased")
    .eq("user_id", userId)
    .maybeSingle();

  let newBalance: number;
  let newTotal: number;

  if (existing?.id) {
    newBalance = ((existing.balance as number) ?? 0) + amount;
    newTotal = ((existing.total_purchased as number) ?? 0) + amount;
    await admin
      .from("video_credits")
      .update({
        balance: newBalance,
        total_purchased: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id as string);
  } else {
    newBalance = amount;
    newTotal = amount;
    await admin.from("video_credits").insert({
      user_id: userId,
      balance: newBalance,
      total_purchased: newTotal,
    });
  }

  await admin.from("video_credit_transactions").insert({
    user_id: userId,
    amount,
    type: "purchase",
    description: `Kjøp av ${amount} videokreditter`,
    stripe_session_id: stripeSessionId,
  });

  logger.info("[videoCredits] Kreditter lagt til", { userId, amount, newBalance, stripeSessionId });

  return { balance: newBalance, totalPurchased: newTotal };
};
