export type LinkedInConnectStatus =
  | "linkedin_cancelled"
  | "linkedin_scope_denied"
  | "linkedin_callback_failed";

const CANCELLED_ERRORS = new Set(["user_cancelled_login", "user_cancelled_authorize"]);

export const linkedInErrorStatus = (error: string): LinkedInConnectStatus => {
  if (CANCELLED_ERRORS.has(error)) return "linkedin_cancelled";
  if (error === "unauthorized_scope_error") return "linkedin_scope_denied";
  return "linkedin_callback_failed";
};

export const safeOAuthText = (value: string | null | undefined): string | undefined =>
  value ? value.replace(/[^\w\s.,:;()'/-]/g, "").slice(0, 300) : undefined;
