import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalText(1000),
  usageSettings: optionalText(1000),
  targetAudience: optionalText(500),
  benefits: z
    .array(z.string().trim().max(200))
    .max(10)
    .default([])
    .transform((items) => [...new Set(items.filter(Boolean))]),
  productUrl: z
    .string()
    .trim()
    .url()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export const productIdSchema = z.string().uuid();
