export type AppError = {
  code: string;
  message: string;
  details?: unknown;
};

export const toAppError = (
  code: string,
  message: string,
  details?: unknown,
): AppError => {
  return { code, message, details };
};

export const toUnknownAppError = (error: unknown): AppError => {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const maybeAppError = error as { code: unknown; message: unknown; details?: unknown };
    if (typeof maybeAppError.code === "string" && typeof maybeAppError.message === "string") {
      return {
        code: maybeAppError.code,
        message: maybeAppError.message,
        details: maybeAppError.details,
      };
    }
  }
  if (error instanceof Error) {
    return { code: "INTERNAL_ERROR", message: error.message };
  }
  return { code: "INTERNAL_ERROR", message: "Unknown internal error", details: error };
};
