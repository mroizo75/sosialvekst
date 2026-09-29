import type { ContentPillar } from "@/lib/ai/postStrategy";
import type { VisualWorld } from "@/lib/ai/visualDirection";

type CopyExample = {
  world: "travel" | "other";
  text: string;
};

const inspirationEvening = `Kveldssolen ligger lavt over de gule fasadene, og gatene blir stille nok til at du hører dine egne skritt.

Det er den timen byen senker tempoet.

Hvilken gate ville du tatt først?

#kveldslys`;

export const COPY_EXAMPLES: Record<ContentPillar, readonly CopyExample[]> = {
  inspiration: [
    { world: "travel", text: inspirationEvening },
    {
      world: "travel",
      text: `Båten legger fra kai før sola er oppe, og du står igjen med kaffen i hånden.

Det er den timen dagen faktisk starter.

Ta med en jakke.`,
    },
    {
      world: "other",
      text: `Melet er ferdig siktet før byen våkner, og de første bollene ligger på rist.

Lukten når deg før skiltet gjør det.

Kom innom før de er borte.`,
    },
  ],
  useful: [
    {
      world: "travel",
      text: `På Korfu ligger den rolige stranden tjue minutter sør for byen.

For deg som vil bade uten strandbar.

By eller strand?`,
    },
    {
      world: "travel",
      text: `Fergen til Hydra tar omtrent nitti minutter fra Pireus.

For deg som vil slippe bil.

Sjekk avgangene før du pakker.`,
    },
    {
      world: "other",
      text: `Vernerunden tar tjue minutter hvis du går samme rute hver uke.

For deg som skal dokumentere avvik før de blir vaner.

Start med det rommet folk bruker mest.`,
    },
  ],
  commercial: [
    {
      world: "travel",
      text: `Leiligheten i Chania ligger fem minutter fra havnen, med kjøkken og plass til fire.

Se hva som finnes akkurat nå.`,
    },
    {
      world: "travel",
      text: `Uka i Alcudia starter på lørdag, og leiligheten har balkong mot gaten.

Passer det bedre enn et hotellrom?`,
    },
    {
      world: "other",
      text: `Keramikkkurset går over fire kvelder, og du tar med koppen hjem.

Det er ledige plasser i oktober.`,
    },
  ],
  trust: [
    {
      world: "travel",
      text: `Bestillingen bekreftes på e-post med navn på den du snakker med.

Slik ser du hvem som følger opp.`,
    },
    {
      world: "travel",
      text: `Svaret kommer skriftlig før du betaler, med navn på den som svarer.

Vil du ha det på e-post?`,
    },
    {
      world: "other",
      text: `Hver avvikslogg får dato, sted og hvem som lukket den.

Slik kan du vise hva som faktisk ble gjort.`,
    },
  ],
};

const isPlaceholder = (text: string): boolean => text.trim().startsWith("[FYLL INN");

const examplesForWorld = (examples: readonly CopyExample[], world?: VisualWorld): string[] => {
  const usable = examples.filter((example) => !isPlaceholder(example.text));
  const preferred = world === "travel"
    ? usable.filter((example) => example.world === "travel")
    : world
      ? usable.filter((example) => example.world === "other")
      : usable;
  const chosen = preferred.length > 0 ? preferred : usable;
  return chosen.map((example) => example.text);
};

export const formatCopyExamples = (pillar: ContentPillar, world?: VisualWorld): string => {
  const lines = examplesForWorld(COPY_EXAMPLES[pillar], world);
  return [
    "EKSEMPLER PÅ GODE INNLEGG (stil, ikke innhold – ikke kopier sted eller fakta):",
    ...lines.flatMap((example, index) => (index === 0 ? [example] : ["---", example])),
  ].join("\n");
};
