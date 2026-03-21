import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { getAppUrl } from "@/lib/env";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe";

const schema = z.object({
  mode: z.enum(["base", "extra_posts"]).default("base"),
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
    const payload = schema.parse(await request.json());
    const appUrl = getAppUrl();
    const stripePriceBase = process.env.STRIPE_PRICE_BASE;
    const stripePriceExtra = process.env.STRIPE_PRICE_EXTRA_POSTS;

    const priceId = payload.mode === "extra_posts" ? stripePriceExtra : stripePriceBase;
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}${withSessionId(successPath)}`,
      cancel_url: `${appUrl}${cancelPath}`,
      client_reference_id: userId,
      metadata: { userId, mode: payload.mode },
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
