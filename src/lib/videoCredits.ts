import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type VideoBalance = {
  balance: number;
  totalPurchased: number;
};

export const getVideoBalance = async (userId: string): Promise<VideoBalance> => {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("video_credits")
    .select("balance, total_purchased")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    balance: (data?.balance as number) ?? 0,
    totalPurchased: (data?.total_purchased as number) ?? 0,
  };
};

export const consumeVideoCredit = async (
  userId: string,
  description: string,
): Promise<VideoBalance> => {
  const admin = createSupabaseAdminClient();

  const { data: row } = await admin
    .from("video_credits")
    .select("id, balance, total_purchased")
    .eq("user_id", userId)
    .maybeSingle();

  const currentBalance = (row?.balance as number) ?? 0;

  if (currentBalance <= 0) {
    throw Object.assign(
      new Error("Ingen videokreditter igjen."),
      toAppError("VIDEO_CREDITS_EXHAUSTED", "Du har ingen videokreditter igjen. Kjøp flere for å generere videoer."),
    );
  }

  const newBalance = currentBalance - 1;

  if (row?.id) {
    await admin
      .from("video_credits")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", row.id as string);
  }

  await admin.from("video_credit_transactions").insert({
    user_id: userId,
    amount: -1,
    type: "usage",
    description,
  });

  logger.info("[videoCredits] Kreditt brukt", { userId, newBalance, description });

  return {
    balance: newBalance,
    totalPurchased: (row?.total_purchased as number) ?? 0,
  };
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
