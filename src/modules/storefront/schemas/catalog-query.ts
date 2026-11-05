import { z } from "zod";

const optionalInteger = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().nonnegative().max(2_000_000_000).optional(),
);

export const storefrontCatalogQuerySchema = z
  .object({
    availability: z.enum(["in_stock", "out_of_stock"]).optional(),
    brand: z.string().trim().max(160).optional(),
    category: z.string().trim().max(160).optional(),
    maxPrice: optionalInteger,
    minPrice: optionalInteger,
    page: z.preprocess(
      (value) => (value === undefined || value === "" ? 1 : Number(value)),
      z.number().int().positive().max(10_000),
    ),
    query: z.string().trim().max(120).optional(),
    sort: z.enum(["newest", "name", "price_asc", "price_desc"]).default("newest"),
  })
  .refine(
    ({ maxPrice, minPrice }) =>
      maxPrice === undefined || minPrice === undefined || minPrice <= maxPrice,
    { message: "Minimum price cannot exceed maximum price.", path: ["minPrice"] },
  );

export type StorefrontCatalogQuery = z.output<typeof storefrontCatalogQuerySchema>;

export function parseStorefrontCatalogQuery(
  input: Record<string, string | string[] | undefined>,
): StorefrontCatalogQuery {
  const scalar = (key: string) => {
    const value = input[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return storefrontCatalogQuerySchema.parse({
    availability: scalar("availability"),
    brand: scalar("brand"),
    category: scalar("category"),
    maxPrice: scalar("maxPrice"),
    minPrice: scalar("minPrice"),
    page: scalar("page"),
    query: scalar("query"),
    sort: scalar("sort"),
  });
}
