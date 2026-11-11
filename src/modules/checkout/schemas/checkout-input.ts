import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null);

export const cartItemInputSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(99),
  variantId: z.string().uuid(),
});

export const checkoutInputSchema = z.object({
  addressLine: z.string().trim().min(8).max(500),
  customerName: z.string().trim().min(2).max(120),
  deliveryInstructions: optionalTrimmed,
  deliveryZoneId: z.string().uuid(),
  email: z.union([z.literal(""), z.email().max(254)]).transform((value) => value || null),
  idempotencyKey: z.string().uuid(),
  landmark: optionalTrimmed,
  mobileNumber: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 -]{7,19}$/)
    .transform((value) => value.replace(/[ -]/g, "")),
  policyConsent: z.literal("on"),
  postalCode: z
    .string()
    .trim()
    .max(24)
    .transform((value) => value || null),
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
