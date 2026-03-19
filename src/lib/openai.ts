import OpenAI from "openai";

import { getRequiredEnv } from "@/lib/env";

export const getOpenAiClient = (): OpenAI | null => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: getRequiredEnv("OPENAI_API_KEY"),
  });
};
