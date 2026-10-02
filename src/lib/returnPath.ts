// Only same-origin paths are allowed so a crafted link cannot send users to another site after OAuth.
export const toSafeReturnPath = (value: string | null | undefined, fallback: string): string =>
  value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
