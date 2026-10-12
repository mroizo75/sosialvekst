import type { Product, SocialChannel } from "@/lib/types";

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
};

export const formatPrice = (amount: number): string =>
  `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(amount).replace(/\s/g, " ")} kr`;

export const productPriceLine = (product: Product): string | undefined => {
  const { price, salePrice } = product;
  if (salePrice !== undefined && price !== undefined && salePrice < price) {
    return `Nå ${formatPrice(salePrice)} (før ${formatPrice(price)})`;
  }
  const current = salePrice ?? price;
  return current !== undefined ? `Pris: ${formatPrice(current)}` : undefined;
};

const directMessageFor = (channel: SocialChannel): string =>
  channel === "facebook" ? "send oss en melding på Messenger" : "send oss en melding her";

const joinAlternatives = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} eller ${items.at(-1)}`;

export const productOrderLine = (product: Product, channel: SocialChannel): string => {
  const url = clean(product.productUrl);
  if (url && channel !== "tiktok") return `Bestill her: ${url}`;
  const { phone, email, messenger } = product.contact;
  const options = [
    messenger || (!phone && !email) ? directMessageFor(channel) : null,
    email ? `send e-post til ${email}` : null,
    phone ? `ring ${phone}` : null,
  ].filter((option): option is string => option !== null);
  return `Bestill: ${joinAlternatives(options)}.`;
};

export const productOrderBlock = (product: Product, channel: SocialChannel): string =>
  [productPriceLine(product), productOrderLine(product, channel)].filter(Boolean).join("\n");

const factLines = (product: Product): string[] => {
  const description = clean(product.description);
  const usage = clean(product.usageSettings);
  const audience = clean(product.targetAudience);
  const benefits = product.benefits.map((benefit) => clean(benefit)).filter((benefit): benefit is string => Boolean(benefit));
  const priceLine = productPriceLine(product);
  return [
    `Produkt: ${product.name}.`,
    description ? `Hva det er: ${description}` : null,
    usage ? `Hvor og når det brukes: ${usage}` : null,
    audience ? `Hvem det er for: ${audience}` : null,
    benefits.length > 0 ? `Fordeler: ${benefits.join("; ")}.` : null,
    priceLine ? `${priceLine}.` : null,
  ].filter((line): line is string => line !== null);
};

export const productCopyLines = (product: Product): string[] => [
  "PRODUKTET SOM SKAL SELGES:",
  ...factLines(product),
  `Dette innlegget skal selge «${product.name}». Det er unntaket fra regelen om at produktet kan utelates.`,
  "Vis produktet i en situasjon der det faktisk brukes, og la leseren se seg selv i den.",
  `Nevn «${product.name}» ved navn minst én gang, naturlig og etter hooken.`,
  "Gjør det tydelig at produktet kan kjøpes. Si kort hvorfor det er verdt det nå.",
  product.salePrice !== undefined
    ? "Tilbudet er et godt salgsargument. Nevn det gjerne i teksten."
    : "Ikke finn på tilbud eller rabatter.",
  "Avslutt med én kort oppfordring til å bestille, for eksempel «Bestill din i dag». Dette er unntaket fra regelen om CTA.",
  "Pris, lenke og kontaktinfo legges til automatisk under teksten. Ikke skriv nettadresse, telefonnummer eller e-post selv.",
  "Bruk bare fakta som står her. Ikke finn på egenskaper, materialer, priser eller tall.",
  "",
];

export const productDesignLine = (product: Product): string =>
  [
    ...factLines(product),
    `Innlegget selger «${product.name}». Forsiden og kortene skal handle om produktet i bruk der det hører hjemme.`,
    "CTA er en kort oppfordring til å bestille produktet.",
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
