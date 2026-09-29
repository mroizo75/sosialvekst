import type { ContentPillar } from "@/lib/ai/postStrategy";

const inspirationExample = `Kveldssolen ligger lavt over de gule fasadene, og gatene blir stille nok til at du hører dine egne skritt.

Det er den timen byen senker tempoet.

Hvilken gate ville du tatt først?

#kveldslys`;

export const COPY_EXAMPLES: Record<ContentPillar, readonly [string, string]> = {
  inspiration: [inspirationExample, "[FYLL INN: inspirasjon 2]"],
  useful: ["[FYLL INN: nyttig 1]", "[FYLL INN: nyttig 2]"],
  commercial: ["[FYLL INN: kommersiell 1]", "[FYLL INN: kommersiell 2]"],
  trust: ["[FYLL INN: tillit 1]", "[FYLL INN: tillit 2]"],
};

export const formatCopyExamples = (pillar: ContentPillar): string => {
  const [first, second] = COPY_EXAMPLES[pillar];
  return [
    "EKSEMPLER PÅ GODE INNLEGG (stil, ikke innhold – ikke kopier sted eller fakta):",
    first,
    "---",
    second,
  ].join("\n");
};
