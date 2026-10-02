import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { planForMode, resolveCheckoutWorkspace, saveWorkspaceSubscription } from "@/lib/billing";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addVideoCredits, isVideoCreditCheckout, paidCreditAmount } from "@/lib/videoCredits";

const schema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = schema.parse(await request.json());
    const stripe = getStripeClient();
    const supabase = createSupabaseAdminClient();

    const session = await stripe.checkout.sessions.retrieve(payload.sessionId, {
      expand: ["subscription"],
    });

    const ownerId = session.metadata?.userId ?? session.client_reference_id ?? "";
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json(
        toAppError("SESSION_NOT_OWNED", "Denne betalingen tilhører en annen bruker."),
        { status: 403 },
      );
    }

    const workspaceId = await resolveCheckoutWorkspace(supabase, userId, session.metadata);

    if (isVideoCreditCheckout(session.metadata)) {
      const creditAmount = paidCreditAmount({ metadata: session.metadata, paymentStatus: session.payment_status });
      if (creditAmount === 0) {
        return NextResponse.json(
          toAppError("PAYMENT_NOT_COMPLETED", "Betalingen er ikke fullført ennå."),
          { status: 400 },
        );
      }
      const credits = await addVideoCredits({ userId, workspaceId }, creditAmount, session.id, supabase);
      return NextResponse.json({ ok: true, kind: "video_credits", balance: credits.balance, workspaceId });
    }

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return NextResponse.json(
        toAppError("PAYMENT_NOT_COMPLETED", "Betaling er ikke fullfort enda."),
        { status: 400 },
      );
    }

    const mode = session.metadata?.mode ?? "base";
    const stripeSubscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? "";
    const stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? "";

    await saveWorkspaceSubscription(supabase, {
      userId,
      workspaceId,
      stripeCustomerId,
      stripeSubscriptionId,
      ...planForMode(mode),
      status: "active",
    });

    return NextResponse.json({ ok: true, status: "active", workspaceId });
  } catch (error) {
    const appError = toUnknownAppError(error);
    logger.error("Stripe confirm failed", {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    });
    return NextResponse.json(
      toAppError("STRIPE_CONFIRM_FAILED", "Kunne ikke bekrefte betaling.", appError),
      { status: 400 },
    );
  }
}

