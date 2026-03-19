import Stripe from "stripe";

import { getRequiredEnv } from "@/lib/env";

export const getStripeClient = (): Stripe => {
  return new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-02-25.clover",
  });
};
