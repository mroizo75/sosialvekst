export const fillIfEmpty = (current: string | undefined, suggested: string | undefined): string =>
  current?.trim() ? current : (suggested?.trim() ?? current ?? "");

export const fillListIfEmpty = (current: string, suggested: string[] | undefined, separator: string): string =>
  current.trim() || !suggested?.length ? current : suggested.join(separator);

const SPARSE_PROFILE_FIELDS = [
  "companyDescription",
  "industry",
  "targetAudience",
  "brandVoice",
  "products",
  "services",
  "keyMessages",
  "coreValues",
  "customerPainPoints",
  "commonQuestions",
] as const;

type ProfileFields = Partial<Record<(typeof SPARSE_PROFILE_FIELDS)[number], string | string[] | null>>;

const isFilled = (value: string | string[] | null | undefined): boolean =>
  Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());

// A profile where fewer than half of the targeting fields are filled gets auto-filled once on load.
export const isProfileSparse = (profile: ProfileFields): boolean =>
  SPARSE_PROFILE_FIELDS.filter((field) => isFilled(profile[field])).length < SPARSE_PROFILE_FIELDS.length / 2;
