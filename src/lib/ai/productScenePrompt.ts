import type { BrandContext, SocialChannel } from "@/lib/types";

type ProductSceneInput = {
  topic: string;
  channel: SocialChannel;
  productName: string;
  brandContext?: BrandContext;
  format?: string;
};

const CHANNEL_COMPOSITION: Record<SocialChannel, string> = {
  instagram: "Square (1:1) composition. Center the product as the hero element. Tight framing, bold presence, scroll-stopping layout.",
  facebook: "Landscape (16:9) composition. Product placed with breathing room, contextual environment visible. Natural, inviting scene.",
  linkedin: "Landscape (16:9) composition. Clean, professional product presentation. Minimal distractions, premium feel.",
  tiktok: "Portrait (9:16) full vertical composition. Product prominent in upper third for thumbnail impact. Dynamic, mobile-first framing.",
};

const FORMAT_SCENE_DIRECTION: Record<string, string> = {
  insight: "Product displayed in a professional setting that suggests expertise and industry knowledge. Clean desk, modern workspace, or studio environment.",
  tip: "Product shown in active use — hands interacting with it, mid-action moment that demonstrates practical value.",
  question: "Product placed in an intriguing or unexpected context that sparks curiosity. Slightly unconventional angle or setting.",
  behind_the_scenes: "Product shown in its natural creation or work environment. Authentic, unpolished but appealing. Workshop, office, or production area.",
  case_study: "Product shown alongside visible results or outcomes. Before/after context, or product in a successful deployment scenario.",
  fact: "Product photographed in a clean, editorial style. Neutral background, precise lighting, the product speaks for itself.",
  how_to: "Product shown step-by-step or mid-process. Hands visible, tools or accessories nearby, instructional context.",
  myth_busting: "Product shown confidently in clear, honest light. No gimmicks — straightforward, transparent presentation.",
  opinion: "Product photographed with character and personality. Strong angle, deliberate lighting that conveys a point of view.",
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
  const channelComp = CHANNEL_COMPOSITION[input.channel];
  const formatDirection = input.format ? FORMAT_SCENE_DIRECTION[input.format] : undefined;
  const industryContext = getIndustrySceneContext(input.brandContext);

  const sections: string[] = [];

  sections.push([
    "TASK: Generate a professional product photography image.",
    `The image MUST prominently feature the product "${input.productName}" from ${companyName}.`,
    "The product in the reference image(s) is the EXACT product that must appear in the generated image.",
    "Preserve the product's exact shape, color, label, packaging, and all visual details from the reference.",
  ].join("\n"));

  sections.push([
    "PRODUCT FIDELITY (CRITICAL — non-negotiable):",
    `- The product "${input.productName}" MUST be clearly visible and recognizable as the SAME product from the reference image(s).`,
    "- Preserve exact colors, shape, proportions, label design, and packaging of the product.",
    "- The product must NOT be obscured, cropped, distorted, or altered in any way.",
    "- If the product has text/labels, they must remain legible and correctly oriented.",
    "- The product should occupy at least 25-40% of the image area.",
    "- No other competing products or brand logos in the scene.",
  ].join("\n"));

  sections.push([
    "SCENE AND CONTEXT:",
    `Topic of the social media post: "${input.topic}".`,
    formatDirection ?? "Product shown in a professional, contextually relevant setting.",
    industryContext,
    "The scene should feel authentic and aspirational — like a professional product photo shoot.",
    "Include contextual props or environment elements that reinforce the topic, but the product remains the clear hero.",
  ].join("\n"));

  if (input.format === "behind_the_scenes" || input.format === "how_to" || input.format === "tip" || input.format === "case_study") {
    sections.push([
      "PEOPLE IN THE SCENE:",
      "Include a person naturally interacting with or using the product.",
      "The person should look genuine and relatable to the target audience.",
      "Show realistic hands, natural skin tones, and authentic body language.",
      "The person supports the scene but the product remains the focal point.",
      "Avoid stiff poses — show natural, candid interaction.",
    ].join("\n"));
  }

  sections.push([
    "COMPOSITION AND FORMAT:",
    channelComp,
    "Use professional studio or on-location lighting.",
    "Shallow depth of field with product in sharp focus.",
    "Color grading: natural, clean, and brand-appropriate.",
  ].join("\n"));

  sections.push([
    "PHOTOGRAPHY QUALITY REQUIREMENTS:",
    "- Professional product photography standard (equivalent to a commercial photo shoot).",
    "- Natural, directional lighting with soft shadows. No harsh artificial look.",
    "- Clean composition with clear visual hierarchy: product first, context second.",
    "- Realistic textures and materials — no plastic/CGI appearance.",
    "- No AI artifacts: no deformed hands, no melted text, no impossible reflections.",
    "- No watermarks, no stock photo indicators, no synthetic feel.",
  ].join("\n"));

  sections.push([
    "STRICT PROHIBITIONS:",
    "- Do NOT change the product's appearance, color, or packaging.",
    "- Do NOT add text, logos, or overlays to the image.",
    "- Do NOT create a collage or split-screen layout.",
    "- Do NOT use neon colors, fantasy elements, or surreal styling.",
    "- Do NOT generate a generic stock photo — this must clearly feature THIS specific product.",
  ].join("\n"));

  return sections.join("\n\n");
};
