import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { getAppUrl } from "@/lib/env";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const VIDEO_CREDIT_MODES = ["video_credits_10", "video_credits_30", "video_credits_100"] as const;
type VideoCreditMode = typeof VIDEO_CREDIT_MODES[number];

const VIDEO_CREDIT_AMOUNTS: Record<VideoCreditMode, number> = {
  video_credits_10: 10,
  video_credits_30: 30,
  video_credits_100: 100,
};

const VIDEO_CREDIT_PRICE_ENVS: Record<VideoCreditMode, string> = {
  video_credits_10: "STRIPE_PRICE_VIDEO_10",
  video_credits_30: "STRIPE_PRICE_VIDEO_30",
  video_credits_100: "STRIPE_PRICE_VIDEO_100",
};

const schema = z.object({
  mode: z.enum(["base", "extra_posts", ...VIDEO_CREDIT_MODES]).default("base"),
  returnPath: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || value.startsWith("/"), "returnPath må starte med /"),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const stripe = getStripeClient();
    const supabase = await createSupabaseServerClient();
    const payload = schema.parse(await request.json());
    const appUrl = getAppUrl();
    const isVideoCredits = payload.mode.startsWith("video_credits_");
    const videoCreditMode = isVideoCredits ? payload.mode as VideoCreditMode : null;

    let priceId: string | undefined;
    if (videoCreditMode) {
      const envName = VIDEO_CREDIT_PRICE_ENVS[videoCreditMode];
      priceId = process.env[envName];
      if (!priceId) {
        return NextResponse.json(
          toAppError("MISSING_STRIPE_PRICE", `Miljøvariabel ${envName} mangler.`),
          { status: 400 },
        );
      }
    } else {
      const stripePriceBase = process.env.STRIPE_PRICE_BASE;
      const stripePriceExtra = process.env.STRIPE_PRICE_EXTRA_POSTS;
      priceId = payload.mode === "extra_posts" ? stripePriceExtra : stripePriceBase;
      if (!priceId) {
        return NextResponse.json(
          toAppError(
            "MISSING_STRIPE_PRICE",
            payload.mode === "extra_posts"
              ? "Miljøvariabel STRIPE_PRICE_EXTRA_POSTS mangler."
              : "Miljøvariabel STRIPE_PRICE_BASE mangler.",
          ),
          { status: 400 },
        );
      }
    }

    const successPath = payload.returnPath && payload.returnPath !== "/"
      ? `${payload.returnPath}${payload.returnPath.includes("?") ? "&" : "?"}payment=success`
      : "/onboarding?payment=success";
    const cancelPath = payload.returnPath && payload.returnPath !== "/"
      ? `${payload.returnPath}${payload.returnPath.includes("?") ? "&" : "?"}payment=cancel`
      : "/onboarding?payment=cancel";

    const withSessionId = (path: string): string => {
      const separator = path.includes("?") ? "&" : "?";
      return `${path}${separator}session_id={CHECKOUT_SESSION_ID}`;
    };

    const { data: subscriptionRow } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    let customerId = subscriptionRow?.stripe_customer_id ?? "";

    if (!customerId) {
      const { data: userResult } = await supabase.auth.getUser();
      const email = userResult.user?.email;
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const checkoutMode = videoCreditMode ? "payment" : "subscription";
    const metadata: Record<string, string> = { userId, mode: payload.mode };
    if (videoCreditMode) {
      metadata.creditAmount = String(VIDEO_CREDIT_AMOUNTS[videoCreditMode]);
    }

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}${withSessionId(successPath)}`,
      cancel_url: `${appUrl}${cancelPath}`,
      customer: customerId,
      client_reference_id: userId,
      metadata,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const appError = toUnknownAppError(error);
    const message = appError.message ?? "";

    logger.error("Stripe checkout failed", {
      code: appError.code,
      message,
      details: appError.details,
    });

    if (appError.code === "UNAUTHORIZED") {
      return NextResponse.json(appError, { status: 401 });
    }

    const detailsMessage =
      message ?? (typeof appError.details === "object" && appError.details !== null && "message" in appError.details
        ? String((appError.details as { message?: unknown }).message ?? "")
        : "");

    if (detailsMessage.includes("STRIPE_SECRET_KEY")) {
      return NextResponse.json(
        toAppError("MISSING_STRIPE_SECRET", "Miljøvariabel STRIPE_SECRET_KEY mangler."),
        { status: 500 },
      );
    }

    if (detailsMessage.includes("APP_URL") || detailsMessage.includes("NEXT_PUBLIC_APP_URL")) {
      return NextResponse.json(
        toAppError("MISSING_APP_URL", "APP_URL mangler i produksjonsmiljøet."),
        { status: 500 },
      );
    }

    if (detailsMessage.toLowerCase().includes("no such price")) {
      return NextResponse.json(
        toAppError(
          "STRIPE_PRICE_NOT_FOUND",
          "Stripe-price finnes ikke. Sjekk at STRIPE_PRICE_BASE matcher samme Stripe-modus (test/live) som STRIPE_SECRET_KEY.",
        ),
        { status: 400 },
      );
    }

    if (detailsMessage.toLowerCase().includes("invalid api key")) {
      return NextResponse.json(
        toAppError("STRIPE_KEY_INVALID", "STRIPE_SECRET_KEY er ugyldig eller i feil modus."),
        { status: 400 },
      );
    }

    return NextResponse.json(
      toAppError(
        "STRIPE_CHECKOUT_FAILED",
        message || "Kunne ikke opprette checkout.",
        appError.details,
      ),
      { status: 400 },
    );
  }
}
