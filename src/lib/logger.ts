type LogLevel = "info" | "warn" | "error";

type LogPayload = {
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    writeLog({ level: "info", message, meta }),
  warn: (message: string, meta?: Record<string, unknown>) =>
    writeLog({ level: "warn", message, meta }),
  error: (message: string, meta?: Record<string, unknown>) =>
    writeLog({ level: "error", message, meta }),
};

const writeLog = (payload: LogPayload): void => {
  const serialized = JSON.stringify({
    ts: new Date().toISOString(),
    ...payload,
  });
  process.stdout.write(`${serialized}\n`);
};
