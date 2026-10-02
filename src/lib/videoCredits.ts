import type { SupabaseClient } from "@supabase/supabase-js";

import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type VideoBalance = {
  balance: number;
  totalPurchased: number;
};

// Credits belong to one business (workspace); a user with several businesses has one balance per business.
export type CreditOwner = {
  userId: string;
  workspaceId: string;
};

const assertOwner = (owner: CreditOwner): void => {
  if (!owner.userId || !owner.workspaceId) {
    throw toAppError("VIDEO_CREDITS_OWNER_MISSING", "Mangler bruker eller bedrift for videokreditter.", {
      hasUser: Boolean(owner.userId),
      hasWorkspace: Boolean(owner.workspaceId),
    });
  }
};

const balanceRow = (supabase: SupabaseClient, owner: CreditOwner) =>
  supabase
    .from("video_credits")
    .select("id, balance, total_purchased")
    .eq("user_id", owner.userId)
    .eq("workspace_id", owner.workspaceId)
    .maybeSingle();

export const getVideoBalance = async (
  owner: CreditOwner,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<VideoBalance> => {
  assertOwner(owner);
  const { data, error } = await balanceRow(supabase, owner);
  if (error) throw toAppError("VIDEO_CREDITS_READ_FAILED", "Kunne ikke lese videokreditter.", error.message);

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
  owner: CreditOwner,
  description: string,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<VideoBalance> => {
  assertOwner(owner);
  for (let attempt = 1; attempt <= CONSUME_ATTEMPTS; attempt += 1) {
    const { data: row, error: readError } = await balanceRow(supabase, owner);
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

    await recordUsage(supabase, owner, description, newBalance);
    return { balance: newBalance, totalPurchased: (row.total_purchased as number) ?? 0 };
  }
  throw toAppError("VIDEO_CREDITS_BUSY", "Videokreditten kunne ikke trekkes akkurat nå. Prøv igjen.");
};

const recordUsage = async (
  supabase: SupabaseClient,
  owner: CreditOwner,
  description: string,
  newBalance: number,
): Promise<void> => {
  const { error } = await supabase.from("video_credit_transactions").insert({
    user_id: owner.userId,
    workspace_id: owner.workspaceId,
    amount: -1,
    type: "usage",
    description,
  });
  if (error) {
    logger.warn("[videoCredits] Kunne ikke logge kredittbruk", { ...owner, error: error.message });
  }

  logger.info("[videoCredits] Kreditt brukt", { ...owner, newBalance, description });
};

const UNIQUE_VIOLATION = "23505";

export type CheckoutCreditInput = {
  metadata?: Record<string, string> | null;
  paymentStatus?: string | null;
};

export const isVideoCreditCheckout = (metadata: CheckoutCreditInput["metadata"]): boolean =>
  (metadata?.mode ?? "").startsWith("video_credits_");

export const paidCreditAmount = ({ metadata, paymentStatus }: CheckoutCreditInput): number => {
  if (!isVideoCreditCheckout(metadata) || paymentStatus !== "paid") return 0;
  const amount = Number(metadata?.creditAmount ?? "0");
  return Number.isInteger(amount) && amount > 0 ? amount : 0;
};

const isSessionCredited = async (supabase: SupabaseClient, stripeSessionId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from("video_credit_transactions")
    .select("id")
    .eq("type", "purchase")
    .eq("stripe_session_id", stripeSessionId)
    .limit(1);
  if (error) throw toAppError("VIDEO_CREDITS_READ_FAILED", "Kunne ikke lese kreditthistorikk.", error.message);
  return (data ?? []).length > 0;
};

const increaseBalance = async (supabase: SupabaseClient, owner: CreditOwner, amount: number): Promise<VideoBalance> => {
  for (let attempt = 1; attempt <= CONSUME_ATTEMPTS; attempt += 1) {
    const { data: row, error: readError } = await balanceRow(supabase, owner);
    if (readError) throw toAppError("VIDEO_CREDITS_READ_FAILED", "Kunne ikke lese videokreditter.", readError.message);

    if (!row?.id) {
      const { error: insertError } = await supabase
        .from("video_credits")
        .insert({ user_id: owner.userId, workspace_id: owner.workspaceId, balance: amount, total_purchased: amount });
      if (!insertError) return { balance: amount, totalPurchased: amount };
      if (insertError.code === UNIQUE_VIOLATION) continue;
      throw toAppError("VIDEO_CREDITS_UPDATE_FAILED", "Kunne ikke legge til videokreditter.", insertError.message);
    }

    const currentBalance = (row.balance as number) ?? 0;
    const balance = currentBalance + amount;
    const totalPurchased = ((row.total_purchased as number) ?? 0) + amount;
    const { data: updated, error: updateError } = await supabase
      .from("video_credits")
      .update({ balance, total_purchased: totalPurchased, updated_at: new Date().toISOString() })
      .eq("id", row.id as string)
      .eq("balance", currentBalance)
      .select("id");
    if (updateError) throw toAppError("VIDEO_CREDITS_UPDATE_FAILED", "Kunne ikke legge til videokreditter.", updateError.message);
    if ((updated ?? []).length > 0) return { balance, totalPurchased };
  }
  throw toAppError("VIDEO_CREDITS_BUSY", "Videokredittene kunne ikke legges til akkurat nå. Prøv igjen.");
};

// The purchase row is written first and is unique per Stripe session, so the webhook and the
// return-page confirmation can both call this without crediting the same payment twice.
export const addVideoCredits = async (
  owner: CreditOwner,
  amount: number,
  stripeSessionId: string,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<VideoBalance & { alreadyCredited: boolean }> => {
  assertOwner(owner);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw toAppError("VIDEO_CREDITS_INVALID_AMOUNT", "Ugyldig antall videokreditter.", { amount });
  }
  if (!stripeSessionId) {
    throw toAppError("VIDEO_CREDITS_MISSING_SESSION", "Mangler Stripe-økt for kjøpet.");
  }

  if (await isSessionCredited(supabase, stripeSessionId)) {
    return { ...(await getVideoBalance(owner, supabase)), alreadyCredited: true };
  }

  const { error: claimError } = await supabase.from("video_credit_transactions").insert({
    user_id: owner.userId,
    workspace_id: owner.workspaceId,
    amount,
    type: "purchase",
    description: `Kjøp av ${amount} videokreditter`,
    stripe_session_id: stripeSessionId,
  });
  if (claimError?.code === UNIQUE_VIOLATION) {
    return { ...(await getVideoBalance(owner, supabase)), alreadyCredited: true };
  }
  if (claimError) {
    throw toAppError("VIDEO_CREDITS_UPDATE_FAILED", "Kunne ikke registrere kjøpet.", claimError.message);
  }

  const result = await increaseBalance(supabase, owner, amount);
  logger.info("[videoCredits] Kreditter lagt til", { ...owner, amount, newBalance: result.balance, stripeSessionId });
  return { ...result, alreadyCredited: false };
};
