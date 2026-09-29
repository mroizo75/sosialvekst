import { evaluatePolicy } from "@/lib/ai/policyEngine";

type RevisionLoopInput = {
  initialText: string;
  imageUrl?: string;
  companyName?: string;
  maxAttempts?: number;
  guideMode?: boolean;
};

type RevisionLoopResult = {
  finalText: string;
  attempts: number;
  status: "draft" | "needs_review";
  reasons: string[];
  qualityTotal: number;
};

const improveText = (text: string, reasons: string[], guideMode = false): string => {
  const withoutSave = text.replace(/\n*Lagre denne til senere\.?/gi, "").trim();
  if (guideMode) return withoutSave;

  const missingCta = reasons.some((r) => r.includes("CTA"));
  if (missingCta) {
    return `${withoutSave}\n\nHvilken ville du valgt?`;
  }

  return withoutSave;
};

export const runRevisionLoop = (input: RevisionLoopInput): RevisionLoopResult => {
  const maxAttempts = input.maxAttempts ?? 2;
  let candidate = input.initialText;

  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const decision = evaluatePolicy({
      text: candidate,
      imageUrl: input.imageUrl,
      companyName: input.companyName,
    });

    if (decision.status === "draft") {
      return {
        finalText: candidate,
        attempts: attempt + 1,
        status: decision.status,
        reasons: decision.reasons,
        qualityTotal: decision.quality.total,
      };
    }

    if (attempt < maxAttempts) {
      candidate = improveText(candidate, decision.reasons, input.guideMode);
    }
  }

  const fallbackDecision = evaluatePolicy({
    text: candidate,
    imageUrl: input.imageUrl,
    companyName: input.companyName,
  });

  return {
    finalText: candidate,
    attempts: maxAttempts + 1,
    status: fallbackDecision.status,
    reasons: fallbackDecision.reasons,
    qualityTotal: fallbackDecision.quality.total,
  };
};
