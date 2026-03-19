import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { persistOnboarding } from "@/lib/onboarding/persistence";
import { onboardingWizardSchema } from "@/lib/onboarding/schema";
import { saveOnboardingState } from "@/lib/onboarding/service";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const step = Number(body.step ?? 1);
    const payload = onboardingWizardSchema.parse({
      companyName: body.companyName,
      fullName: body.fullName,
      countryCode: body.countryCode,
      targetAudience: body.targetAudience,
      brandVoice: body.brandVoice,
      keyMessages: body.keyMessages,
      logoUrl: body.logoUrl,
      mediaMode: body.mediaMode,
      channels: body.channels,
      websiteUrl: body.websiteUrl,
      companyDescription: body.companyDescription,
      products: body.products,
      uniqueSellingPoints: body.uniqueSellingPoints,
    });

    const record = saveOnboardingState(userId, step, payload);
    await persistOnboarding(userId, payload);

    return NextResponse.json(record);
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("ONBOARDING_SAVE_FAILED", "Kunne ikke lagre onboarding", appError),
      { status: 400 },
    );
  }
}
