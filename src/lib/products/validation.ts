import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalPrice = z
  .number()
  .nonnegative()
  .max(10_000_000)
  .nullable()
  .optional()
  .transform((value) => (value === null || value === undefined ? undefined : Math.round(value * 100) / 100));

export const productInputSchema = z
  .object({
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
    price: optionalPrice,
    salePrice: optionalPrice,
  })
  .refine(
    (input) => input.price === undefined || input.salePrice === undefined || input.salePrice < input.price,
    { message: "Tilbudsprisen må være lavere enn ordinær pris.", path: ["salePrice"] },
  );

export type ProductInput = z.infer<typeof productInputSchema>;

export const productValidationMessage = (error: z.ZodError): string =>
  error.issues.some((issue) => issue.path[0] === "salePrice" && issue.code === "custom")
    ? "Tilbudsprisen må være lavere enn ordinær pris."
    : "Produktet mangler navn eller har ugyldige felt.";

export const productIdSchema = z.string().uuid();

export const orderContactSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^\+?[\d\s-]{5,}$/, "Ugyldig telefonnummer.")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value.replace(/\s+/g, " ") : undefined)),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
  messenger: z.boolean(),
});

export type OrderContactInput = z.infer<typeof orderContactSchema>;
