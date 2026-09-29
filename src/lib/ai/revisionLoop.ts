import { evaluatePolicy } from "@/lib/ai/policyEngine";

type RevisionLoopInput = {
  initialText: string;
  imageUrl?: string;
  companyName?: string;
  maxAttempts?: number;
};

type RevisionLoopResult = {
  finalText: string;
  attempts: number;
  status: "draft" | "needs_review";
  reasons: string[];
  qualityTotal: number;
};

const stripSaveLine = (text: string): string =>
  text.replace(/\n*Lagre denne til senere\.?/gi, "").trim();

const missingCta = (reasons: string[]): boolean =>
  reasons.some((reason) => reason.includes("CTA"));

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

    if (missingCta(decision.reasons)) {
      return {
        finalText: stripSaveLine(candidate),
        attempts: attempt + 1,
        status: "needs_review",
        reasons: decision.reasons,
        qualityTotal: decision.quality.total,
      };
    }

    if (attempt < maxAttempts) {
      candidate = stripSaveLine(candidate);
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
