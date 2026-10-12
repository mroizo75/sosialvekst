import type { Product } from "@/lib/types";

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
};

const factLines = (product: Product): string[] => {
  const description = clean(product.description);
  const usage = clean(product.usageSettings);
  const audience = clean(product.targetAudience);
  const benefits = product.benefits.map((benefit) => clean(benefit)).filter((benefit): benefit is string => Boolean(benefit));
  return [
    `Produkt: ${product.name}.`,
    description ? `Hva det er: ${description}` : null,
    usage ? `Hvor og når det brukes: ${usage}` : null,
    audience ? `Hvem det er for: ${audience}` : null,
    benefits.length > 0 ? `Fordeler: ${benefits.join("; ")}.` : null,
  ].filter((line): line is string => line !== null);
};

export const productCopyLines = (product: Product): string[] => [
  "PRODUKTET SOM SKAL MARKEDSFØRES:",
  ...factLines(product),
  `Dette innlegget skal markedsføre «${product.name}». Det er unntaket fra regelen om at produktet kan utelates.`,
  "Vis produktet i en situasjon der det faktisk brukes, og la leseren se seg selv i den.",
  `Nevn «${product.name}» ved navn minst én gang, naturlig og etter hooken.`,
  "Bruk bare fakta som står her. Ikke finn på egenskaper, materialer, priser eller tall.",
  "Søyle og format styrer vinkelen, men produktet skal være tydelig med.",
  "",
];

export const productDesignLine = (product: Product): string =>
  [
    ...factLines(product),
    `Innlegget markedsfører «${product.name}». Forsiden og kortene skal handle om produktet i bruk der det hører hjemme.`,
  ].join(" ");

export const productSceneDirection = (product: Product): string => {
  const usage = clean(product.usageSettings);
  const audience = clean(product.targetAudience);
  return [
    usage
      ? `Show the product in its natural use setting, as described by the business: ${usage}.`
      : "Show the product where it is naturally used in everyday life, never as an isolated studio object.",
    audience ? `The people in the scene match this audience: ${audience}.` : null,
    "If the product is worn or held, show a real person wearing or using it in that setting.",
  ].filter((line): line is string => line !== null).join(" ");
};

export const productTopic = (product: Product): string => {
  const usage = clean(product.usageSettings)?.slice(0, 140);
  return usage ? `${product.name} i bruk: ${usage}` : `${product.name} i bruk`;
};
