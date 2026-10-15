import { productSceneDirection } from "@/lib/products/productPrompt";
import type { BrandContext, Product, SocialChannel } from "@/lib/types";

type ProductSceneInput = {
  topic: string;
  channel: SocialChannel;
  product: Product;
  brandContext?: BrandContext;
  format?: string;
  variation?: string;
  appearance?: string;
};

const CHANNEL_COMPOSITION: Record<SocialChannel, string> = {
  instagram: "Square (1:1) composition. Center the product as the hero element. Tight framing, bold presence, scroll-stopping layout.",
  facebook: "Landscape (16:9) composition. Product placed with breathing room, contextual environment visible. Natural, inviting scene.",
  linkedin: "Landscape (16:9) composition. Clean, professional product presentation. Minimal distractions, premium feel.",
  tiktok: "Portrait (9:16) full vertical composition. Product prominent in upper third for thumbnail impact. Dynamic, mobile-first framing.",
};

const FORMAT_SCENE_DIRECTION: Record<string, string> = {
  insight: "Product in the real environment the customer wants — destination, kitchen, workshop or store. Never a desk with a laptop.",
  tip: "Product shown in active use in that same real environment.",
  question: "Product placed in an intriguing real-world context that sparks desire or curiosity.",
  behind_the_scenes: "Product in its natural creation or service environment: hotel, kitchen, workshop or field. Not an office.",
  case_study: "Product shown with visible results in the same real setting.",
  fact: "Product photographed in a clean, editorial style. Neutral background, precise lighting.",
  how_to: "Product shown mid-process in the relevant environment. Tools nearby, no office desk.",
  myth_busting: "Product shown honestly in clear light. No gimmicks.",
  opinion: "Product photographed with character in brand-relevant surroundings.",
};

const getIndustrySceneContext = (brandContext?: BrandContext): string => {
  const parts: string[] = [];

  if (brandContext?.industry) {
    parts.push(`Industry context: ${brandContext.industry}.`);
  }
  if (brandContext?.companyDescription) {
    parts.push(`Business context: ${brandContext.companyDescription}.`);
  }
  if (brandContext?.targetAudience) {
    parts.push(`Target audience: ${brandContext.targetAudience}.`);
  }

  return parts.length > 0 ? parts.join(" ") : "";
};

export const buildProductScenePrompt = (input: ProductSceneInput): string => {
  const ctx = input.brandContext ?? {};
  const companyName = ctx.companyName ?? "the brand";
  const productName = input.product.name;
  const channelComp = CHANNEL_COMPOSITION[input.channel];
  const formatDirection = input.format ? FORMAT_SCENE_DIRECTION[input.format] : undefined;
  const industryContext = getIndustrySceneContext(input.brandContext);
  const description = input.product.description?.trim();

  const sections: string[] = [];

  sections.push([
    "TASK: Generate a professional lifestyle photo for a social media post.",
    `The image MUST prominently feature the product "${productName}" from ${companyName}.`,
    description ? `What the product is: ${description}` : "",
    "The product in the reference image(s) is the EXACT product that must appear in the generated image.",
    "Preserve the product's exact shape, color, label, packaging, and all visual details from the reference.",
  ].filter(Boolean).join("\n"));

  sections.push([
    "PRODUCT FIDELITY (CRITICAL — non-negotiable):",
    `- The product "${productName}" MUST be clearly visible and recognizable as the SAME product from the reference image(s).`,
    "- Preserve exact colors, shape, proportions, label design, and packaging of the product.",
    "- The product must NOT be obscured, cropped, distorted, or altered in any way.",
    "- If the product has text/labels, they must remain legible and correctly oriented.",
    "- The product should occupy at least 20-40% of the image area.",
    "- No competing products. Keep this product's own label exactly as in the reference.",
    "- Copy the product from the reference photos. Do not redesign, restyle, recolour or reinterpret it from its name.",
    "- Mannequins, display stands, boxes and backdrops in the reference photos are not the product. Leave them out.",
  ].join("\n"));

  if (input.appearance) {
    sections.push(`EXACT PRODUCT APPEARANCE (from the reference photos):\n${input.appearance}`);
  }

  sections.push([
    "SCENE AND CONTEXT:",
    `Topic of the social media post: "${input.topic}".`,
    input.variation
      ? `This image is one slide in a carousel about: "${input.variation}". Show a different moment, angle or setting than the cover, with the same product.`
      : "",
    productSceneDirection(input.product),
    formatDirection ?? "Product shown in a contextually relevant, real-world setting.",
    industryContext,
    "The scene should feel authentic, like a real moment photographed on location, not a studio packshot.",
    "Include environment elements that show where and when the product is used, but the product remains the clear hero.",
  ].filter(Boolean).join("\n"));

  sections.push([
    "PEOPLE IN THE SCENE:",
    "A person may appear when they are using or wearing the product in its real setting.",
    "Never show anyone sitting at a computer, laptop or office desk.",
    "The product remains the focal point.",
  ].join("\n"));

  sections.push([
    "COMMERCIAL GOAL:",
    "This image sells the product. It should look like a premium campaign photo the brand would pay for.",
    "Make the product look desirable through setting, light and composition, never by changing the product.",
    "Only the surroundings, light and camera angle are new. The product is the same physical item as in the reference photos.",
  ].join("\n"));

  sections.push([
    "COMPOSITION AND FORMAT:",
    channelComp,
    "Use natural on-location lighting that fits the setting (for example evening light for an evening scene).",
    "Shallow depth of field with product in sharp focus.",
    "Color grading: natural, clean, and brand-appropriate.",
  ].join("\n"));

  sections.push([
    "PHOTOGRAPHY QUALITY REQUIREMENTS:",
    "- Professional commercial photography standard.",
    "- Natural, directional lighting with soft shadows. No harsh artificial look.",
    "- Clean composition with clear visual hierarchy: product first, context second.",
    "- Realistic textures and materials — no plastic/CGI appearance.",
    "- No AI artifacts: no deformed hands, no melted text, no impossible reflections.",
    "- No watermarks, no stock photo indicators, no synthetic feel.",
  ].join("\n"));

  sections.push([
    "STRICT PROHIBITIONS:",
    "- Do NOT change the product's appearance, color, or packaging.",
    "- Do NOT draw extra logos, wordmarks, watermarks or overlays. The real logo is composited afterwards in the top-left, so keep that corner clear.",
    "- Do NOT create a collage or split-screen layout.",
    "- Do NOT use neon colors, fantasy elements, or surreal styling.",
    "- Do NOT generate a generic stock photo — this must clearly feature THIS specific product.",
    "- Do NOT show a person at a computer, laptop, or in an office landscape.",
  ].join("\n"));

  return sections.join("\n\n");
};
