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

const improveText = (text: string, reasons: string[]): string => {
  let improved = text;

  const missingCta = reasons.some((r) => r.includes("CTA"));
  if (missingCta) {
    const ctaOptions = [
      "\n\nHvilken ville du valgt?",
      "\n\nLagre denne til senere.",
      "\n\nSend den til den du vil gjøre det med.",
    ];
    const ctaIndex = text.length % ctaOptions.length;
    improved = `${improved}${ctaOptions[ctaIndex]}`;
  }

  return improved;
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
      candidate = improveText(candidate, decision.reasons);
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
