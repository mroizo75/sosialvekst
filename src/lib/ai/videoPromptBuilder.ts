import type { BrandContext } from "@/lib/types";

export type VideoType = "product" | "intro" | "service" | "event" | "testimonial";

type PromptParts = {
  scene: string;
  camera: string;
  lighting: string;
  audio: string;
};

const buildBrandBlock = (ctx: BrandContext): string => {
  const parts: string[] = [];
  if (ctx.companyName) parts.push(`Company: "${ctx.companyName}"`);
  if (ctx.industry) parts.push(`Industry: ${ctx.industry}`);
  if (ctx.companyDescription) parts.push(`About: ${ctx.companyDescription}`);
  if (ctx.products?.length) parts.push(`Products: ${ctx.products.join(", ")}`);
  if (ctx.services?.length) parts.push(`Services: ${ctx.services.join(", ")}`);
  if (ctx.uniqueSellingPoints?.length) parts.push(`Key strengths: ${ctx.uniqueSellingPoints.join(". ")}`);
  if (ctx.targetAudience) parts.push(`Target audience: ${ctx.targetAudience}`);
  return parts.join(". ");
};

const SHARED_RULES = [
  "NO text overlays, NO subtitles, NO floating text, NO captions, NO written words anywhere in the frame.",
  "Company name or logo ONLY visible when naturally part of the scene: printed on uniforms, signage, vehicles, product packaging, or building facades.",
  "Cinematic quality with smooth, professional camera movements.",
  "Professional, natural lighting that matches the setting.",
  "Background music and ambient sound effects only. NO speech, NO voiceover, NO narration, NO dialogue.",
  "Modern, clean visual aesthetic suitable for social media marketing.",
].join("\n");

const buildSceneByType = (
  videoType: VideoType,
  userDescription: string,
  ctx: BrandContext,
): PromptParts => {
  const name = ctx.companyName ?? "the company";
  const industry = ctx.industry ?? "business";
  const products = ctx.products?.join(", ") ?? "";
  const services = ctx.services?.join(", ") ?? "";
  const usps = ctx.uniqueSellingPoints?.join(". ") ?? "";

  switch (videoType) {
    case "product": {
      const productList = products || services || "their offerings";
      return {
        scene: `A premium product showcase video for ${name} (${industry}). The focus is on ${productList}. ${userDescription}. The product is the hero — shown from multiple angles with elegant transitions. Close-up detail shots reveal quality and craftsmanship. A clean, minimal background lets the product stand out. The product rotates slowly on a sleek surface or is shown being used in a real-world context.`,
        camera: "Smooth orbiting shots around the product. Slow push-ins to detail. Macro close-ups. Gentle slider movements.",
        lighting: "Studio-quality lighting with soft key light, subtle rim light for depth, and a clean gradient background.",
        audio: "Elegant, minimal electronic or ambient music. Subtle whoosh sounds on transitions.",
      };
    }

    case "intro": {
      const desc = ctx.companyDescription ?? `a ${industry} company`;
      const values = ctx.coreValues?.join(", ") ?? "";
      return {
        scene: `A professional brand introduction video for ${name} — ${desc}. ${userDescription}. The video conveys trust, expertise, and quality. Show the team at work, the workplace or operations in action, and satisfied interactions.${values ? ` The company's core values (${values}) are reflected through the visuals.` : ""}${usps ? ` Key strengths: ${usps}.` : ""}`,
        camera: "Cinematic dolly and crane shots. Smooth tracking following people at work. Wide establishing shots transitioning to medium and close-up.",
        lighting: "Warm, natural lighting. Golden hour feel for outdoor shots. Clean, bright lighting for indoor workspace shots.",
        audio: "Uplifting, inspiring corporate music with a confident feel. Ambient workplace sounds subtly mixed in.",
      };
    }

    case "service": {
      const serviceList = services || products || "their professional services";
      return {
        scene: `A service demonstration video for ${name} (${industry}). Showcasing: ${serviceList}. ${userDescription}. The video shows the service being performed professionally — from arrival or preparation, through the work itself, to the impressive end result. A satisfied customer reacts positively. The transformation or value delivered is clearly visible.`,
        camera: "Dynamic tracking shots following the service in progress. Before-and-after reveals with smooth transitions. Over-the-shoulder shots showing the professional at work.",
        lighting: "Natural, realistic lighting matching the work environment. Clean and bright to emphasize professionalism.",
        audio: "Motivating, upbeat background music. Natural ambient sounds from the work environment mixed subtly.",
      };
    }

    case "event": {
      return {
        scene: `An energetic promotional video for ${name} (${industry}). ${userDescription}. The video creates excitement and urgency. Fast-paced montage of activity, people engaging enthusiastically, dynamic visuals that grab attention. The atmosphere is vibrant and inviting.${usps ? ` Highlights: ${usps}.` : ""}`,
        camera: "Fast-paced editing with quick cuts. Handheld energy mixed with stabilized beauty shots. Low-angle hero shots. Dramatic reveals.",
        lighting: "High-energy lighting with dynamic contrast. Colorful, vibrant. Event-style lighting with atmosphere.",
        audio: "High-energy, driving music with bass and rhythm. Crowd ambiance and excitement sounds.",
      };
    }

    case "testimonial": {
      const audience = ctx.targetAudience ?? "customers";
      return {
        scene: `An authentic testimonial-style video for ${name} (${industry}). ${userDescription}. The video shows a real-feeling scenario where ${audience} experience the value of ${name}. A person is visibly satisfied, relieved, or impressed after using the product or service. The setting feels genuine and relatable — in their home, office, or relevant environment.`,
        camera: "Intimate medium shots and close-ups. Steady, documentary-style framing. Gentle rack focus between subject and environment.",
        lighting: "Soft, natural window light. Warm and authentic. No harsh studio feel — it should look real and trustworthy.",
        audio: "Gentle, warm acoustic or piano background music. Subtle ambient sounds from the environment.",
      };
    }
  }
};

export const buildVideoPrompt = (
  videoType: VideoType,
  userDescription: string,
  brandContext: BrandContext,
): string => {
  const brandBlock = buildBrandBlock(brandContext);
  const parts = buildSceneByType(videoType, userDescription, brandContext);

  const sections = [
    `[BRAND CONTEXT] ${brandBlock}`,
    "",
    `[SCENE] ${parts.scene}`,
    "",
    `[CAMERA] ${parts.camera}`,
    "",
    `[LIGHTING] ${parts.lighting}`,
    "",
    `[AUDIO] ${parts.audio}`,
    "",
    `[STRICT RULES]\n${SHARED_RULES}`,
  ];

  return sections.join("\n");
};
