import { onboardingWizardSchema, type OnboardingWizardSchema } from "@/lib/onboarding/schema";

type OnboardingRecord = {
  userId: string;
  step: number;
  completed: boolean;
  data: OnboardingWizardSchema | null;
};

const onboardingStore = new Map<string, OnboardingRecord>();

export const getOnboardingState = (userId: string): OnboardingRecord => {
  const existing = onboardingStore.get(userId);
  if (existing) {
    return existing;
  }

  const initial: OnboardingRecord = {
    userId,
    step: 1,
    completed: false,
    data: null,
  };
  onboardingStore.set(userId, initial);
  return initial;
};

export const saveOnboardingState = (
  userId: string,
  step: number,
  payload: unknown,
): OnboardingRecord => {
  const parsed = onboardingWizardSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }

  const record: OnboardingRecord = {
    userId,
    step,
    completed: step >= 7,
    data: parsed.data,
  };
  onboardingStore.set(userId, record);
  return record;
};
