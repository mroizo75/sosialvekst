import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

    const normalizedStatus = "active";

    const { error } = await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        plan_code: mode === "extra_posts" ? "extra_5x4" : "base_3x4",
        extra_posts_per_week: mode === "extra_posts" ? 2 : 0,
        status: normalizedStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      logger.error("Stripe confirm upsert failed", {
        userId,
        sessionId: payload.sessionId,
        stripeSubscriptionId,
        stripeCustomerId,
        dbError: error.message,
      });
      return NextResponse.json(
        toAppError("CONFIRM_SAVE_FAILED", "Kunne ikke oppdatere abonnement.", {
          message: error.message,
        }),
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, status: normalizedStatus });
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

