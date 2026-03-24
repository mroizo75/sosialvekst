export type SocialChannel = "facebook" | "instagram" | "linkedin" | "tiktok";

export type MediaMode = "ai_only" | "hybrid" | "owned_only";
export type ImageProfile = "preview" | "final";

export type PostStatus = "generating" | "draft" | "approved" | "scheduled" | "published" | "failed" | "needs_review";

export type PostIntent =
  | "brand_awareness"
  | "traffic"
  | "engagement"
  | "lead_generation"
  | "authority"
  | "community";

export type PostFormat =
  | "insight"
  | "tip"
  | "question"
  | "behind_the_scenes"
  | "case_study"
  | "fact"
  | "how_to"
  | "myth_busting"
  | "opinion";

export type QualityScore = {
  languageQuality: number;
  brandMatch: number;
  factualClarity: number;
  engagementPotential: number;
  visualQuality: number;
  ctaPresent: boolean;
  companyMentioned: boolean;
  total: number;
};

export type TopicWindow = {
  topic: string;
  startWeek: number;
  endWeek: number;
};

export type ProductImage = {
  id: string;
  productName: string;
  imageUrl: string;
  sortOrder: number;
};

export type BrandContext = {
  companyName?: string;
  companyDescription?: string;
  industry?: string;
  foundedYear?: string;
  teamDescription?: string;
  coreValues?: string[];
  targetAudience?: string;
  customerPainPoints?: string[];
  customerSuccessStories?: string[];
  products?: string[];
  services?: string[];
  uniqueSellingPoints?: string[];
  priceRange?: string;
  brandVoice?: string;
  brandPersonality?: string;
  brandDosAndDonts?: string;
  keyMessages?: string[];
  competitorDifferentiators?: string;
  commonQuestions?: string[];
  seasonalFocus?: string;
  logoUrl?: string;
  websiteUrl?: string;
  websiteContent?: string;
  productImages?: ProductImage[];
};

export type OnboardingInput = {
  companyName: string;
  fullName: string;
  countryCode: string;
  targetAudience: string;
  brandVoice: string;
  keyMessages: string[];
  logoUrl?: string;
  mediaMode: MediaMode;
  channels: SocialChannel[];
  preferredLanguage: "nb-NO";
};

export type PostDraft = {
  id: string;
  channel: SocialChannel;
  scheduledAt: string;
  text: string;
  imageUrl?: string;
  additionalImageUrls?: string[];
  videoUrl?: string;
  status: PostStatus;
  quality: QualityScore;
  intent?: PostIntent;
  format?: PostFormat;
};
