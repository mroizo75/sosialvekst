import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
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
    const appUrl = process.env.APP_URL;
    const stripePriceBase = process.env.STRIPE_PRICE_BASE;
    const stripePriceExtra = process.env.STRIPE_PRICE_EXTRA_POSTS;

    if (!appUrl) {
      return NextResponse.json(
        toAppError("MISSING_APP_URL", "Miljøvariabel APP_URL mangler."),
        { status: 400 },
      );
    }

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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}${successPath}`,
      cancel_url: `${appUrl}${cancelPath}`,
      client_reference_id: userId,
      metadata: { userId, mode: payload.mode },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      toAppError("STRIPE_CHECKOUT_FAILED", "Kunne ikke opprette checkout", toUnknownAppError(error)),
      { status: 400 },
    );
  }
}
