export type BrandRules = {
  toneOfVoice: string;
  prohibitedTerms: string[];
  keyMessages: string[];
  targetAudience: string;
  logoPlacement: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  safeMarginPx: number;
};

export const defaultBrandRules: BrandRules = {
  toneOfVoice: "Profesjonell, varm og tydelig.",
  prohibitedTerms: [
    "garantert",
    "100% sikker gevinst",
    "klikk her",
    "dette endrer alt",
    "du vil ikke tro",
  ],
  keyMessages: [
    "Hjelper kundene med konkrete losninger",
    "Bygger tillit med faglig kvalitet",
  ],
  targetAudience: "Norske bedrifter og beslutningstakere",
  logoPlacement: "bottom_right",
  safeMarginPx: 24,
};

export const mergeBrandRules = (input: {
  targetAudience?: string;
  brandVoice?: string;
  keyMessages?: string[];
  coreValues?: string[];
}): BrandRules => {
  const combined = [
    ...(input.keyMessages && input.keyMessages.length > 0
      ? input.keyMessages
      : defaultBrandRules.keyMessages),
    ...(input.coreValues ?? []),
  ];
  const uniqueMessages = [...new Set(combined)];

  return {
    ...defaultBrandRules,
    targetAudience: input.targetAudience?.trim() || defaultBrandRules.targetAudience,
    toneOfVoice: input.brandVoice?.trim() || defaultBrandRules.toneOfVoice,
    keyMessages: uniqueMessages,
  };
};
