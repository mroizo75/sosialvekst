const env = process.env;

export const getRequiredEnv = (key: string): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const getAppUrl = (): string => {
  const raw =
    env.APP_URL ??
    env.NEXT_PUBLIC_APP_URL ??
    env.SITE_URL ??
    env.NEXT_PUBLIC_SITE_URL ??
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined);

  if (!raw) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "Missing APP_URL (or NEXT_PUBLIC_APP_URL/SITE_URL) in production environment.",
      );
    }
    return "http://localhost:3000";
  }

  const normalized = raw.trim().replace(/\/+$/, "");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  return `https://${normalized}`;
};
