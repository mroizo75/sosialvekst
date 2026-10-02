import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { planForMode, resolveCheckoutWorkspace, saveWorkspaceSubscription } from "@/lib/billing";
import { getRequiredEnv } from "@/lib/env";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addVideoCredits, isVideoCreditCheckout, paidCreditAmount } from "@/lib/videoCredits";

const handleEvent = async (event: Stripe.Event): Promise<void> => {
  const supabase = createSupabaseAdminClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const mode = session.metadata?.mode ?? "base";
    if (!userId) {
      return;
    }
    const workspaceId = await resolveCheckoutWorkspace(supabase, userId, session.metadata);

    if (isVideoCreditCheckout(session.metadata)) {
      const creditAmount = paidCreditAmount({ metadata: session.metadata, paymentStatus: session.payment_status });
      if (creditAmount === 0) {
        logger.warn("Kjøp av videokreditter uten betalt status", {
          eventId: event.id,
          sessionId: session.id,
          paymentStatus: session.payment_status,
        });
        return;
      }
      const result = await addVideoCredits({ userId, workspaceId }, creditAmount, session.id, supabase);
      logger.info("Video credits purchased via Stripe", {
        eventId: event.id,
        sessionId: session.id,
        userId,
        workspaceId,
        creditAmount,
        alreadyCredited: result.alreadyCredited,
      });
      return;
    }

    await saveWorkspaceSubscription(supabase, {
      userId,
      workspaceId,
      stripeCustomerId: String(session.customer ?? ""),
      stripeSubscriptionId: String(session.subscription ?? ""),
      ...planForMode(mode),
      status: "active",
    });

    logger.info("Stripe checkout completed", {
      eventId: event.id,
      sessionId: session.id,
    });
    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? "";

    const normalizedStatus =
      subscription.status === "active" || subscription.status === "trialing"
        ? "active"
        : subscription.status === "canceled"
          ? "canceled"
          : "past_due";

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (existing?.user_id) {
      const { error } = await supabase
        .from("subscriptions")
        .update({
          stripe_subscription_id: subscription.id,
          stripe_customer_id: customerId,
          status: normalizedStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        throw new Error(error.message);
      }
      return;
    }

    const ownerUserId = subscription.metadata?.userId;
    if (!ownerUserId) {
      logger.warn("Stripe subscription event uten matchende bedrift", {
        eventId: event.id,
        subscriptionId: subscription.id,
        customerId,
      });
      return;
    }

    await saveWorkspaceSubscription(supabase, {
      userId: ownerUserId,
      workspaceId: await resolveCheckoutWorkspace(supabase, ownerUserId, subscription.metadata),
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      ...planForMode(subscription.metadata?.mode),
      status: normalizedStatus,
    });
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const maybeInvoice = invoice as Stripe.Invoice & {
      subscription?: string | { id?: string } | null;
    };
    const subscriptionId = typeof maybeInvoice.subscription === "string"
      ? maybeInvoice.subscription
      : maybeInvoice.subscription?.id
        ?? ("parent" in invoice && invoice.parent && "subscription_details" in invoice.parent
          ? String(invoice.parent.subscription_details?.subscription ?? "")
          : "");
    if (!subscriptionId) {
      logger.warn("invoice.payment_failed uten subscriptionId", { eventId: event.id });
      return;
    }

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscriptionId);

    if (error) {
      throw new Error(error.message);
    }
  }
};

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const signature = (await headers()).get("stripe-signature");
    if (!signature) {
      return NextResponse.json(toAppError("MISSING_SIGNATURE", "Mangler Stripe-signatur"), {
        status: 400,
      });
    }

    const body = await request.text();
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      getRequiredEnv("STRIPE_WEBHOOK_SECRET"),
    );

    await handleEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    const appError = toUnknownAppError(error);
    logger.error("Stripe webhook failed", { error: appError });
    return NextResponse.json(appError, { status: 400 });
  }
}
