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

const improveText = (text: string, reasons: string[], companyName?: string): string => {
  let improved = text;

  const missingCompany = reasons.some((r) => r.includes("Bedriftsnavnet"));
  if (missingCompany && companyName) {
    const sentences = improved.split(". ");
    if (sentences.length >= 2) {
      sentences[1] = `Hos ${companyName} ${sentences[1].charAt(0).toLowerCase()}${sentences[1].slice(1)}`;
      improved = sentences.join(". ");
    } else {
      improved = `${companyName} presenterer: ${improved}`;
    }
  }

  const missingCta = reasons.some((r) => r.includes("CTA"));
  if (missingCta) {
    const ctaOptions = companyName
      ? [
          `\n\nHva er din erfaring? Del gjerne i kommentarfeltet.`,
          `\n\nVil du vite mer om hvordan ${companyName} kan hjelpe? Ta kontakt for en uforpliktende prat.`,
          `\n\nFolg ${companyName} for flere tips og innsikt.`,
        ]
      : [
          `\n\nHva tenker du? Del gjerne i kommentarfeltet.`,
          `\n\nFolg oss for flere tips og faglig innsikt.`,
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
      candidate = improveText(candidate, decision.reasons, input.companyName);
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
