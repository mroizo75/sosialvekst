import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getRequiredEnv } from "@/lib/env";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addVideoCredits } from "@/lib/videoCredits";

const handleEvent = async (event: Stripe.Event): Promise<void> => {
  const supabase = createSupabaseAdminClient();

  const saveSubscriptionByUser = async (
    userId: string,
    payload: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      planCode?: string;
      extraPostsPerWeek?: number;
      status: "active" | "past_due" | "canceled";
    },
  ): Promise<void> => {
    const row = {
      user_id: userId,
      stripe_customer_id: payload.stripeCustomerId ?? "",
      stripe_subscription_id: payload.stripeSubscriptionId ?? "",
      plan_code: payload.planCode ?? "base_3x4",
      extra_posts_per_week: payload.extraPostsPerWeek ?? 0,
      status: payload.status,
      updated_at: new Date().toISOString(),
    };

    const { data: existingRows, error: existingError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingId = existingRows?.[0]?.id;
    const { error } = existingId
      ? await supabase
          .from("subscriptions")
          .update(row)
          .eq("id", existingId)
      : await supabase
          .from("subscriptions")
          .insert(row);

    if (error) {
      throw new Error(error.message);
    }
  };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const mode = session.metadata?.mode ?? "base";
    if (!userId) {
      return;
    }

    if (mode.startsWith("video_credits_")) {
      const creditAmount = Number(session.metadata?.creditAmount ?? "0");
      if (creditAmount > 0) {
        await addVideoCredits(userId, creditAmount, session.id);
        logger.info("Video credits purchased via Stripe", {
          eventId: event.id,
          sessionId: session.id,
          userId,
          creditAmount,
        });
      }
      return;
    }

    await saveSubscriptionByUser(userId, {
      stripeCustomerId: String(session.customer ?? ""),
      stripeSubscriptionId: String(session.subscription ?? ""),
      planCode: mode === "extra_posts" ? "extra_5x4" : "base_3x4",
      extraPostsPerWeek: mode === "extra_posts" ? 2 : 0,
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

    const { data: byCustomer } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .limit(1)
      .maybeSingle();

    if (!byCustomer?.user_id) {
      logger.warn("Stripe subscription event uten matchende bruker", {
        eventId: event.id,
        subscriptionId: subscription.id,
        customerId,
      });
      return;
    }

    await saveSubscriptionByUser(byCustomer.user_id, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
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
