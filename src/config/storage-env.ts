import { z } from "zod";

import { EnvironmentConfigurationError } from "@/config/env";

export function getProductStorageBucket(): string {
  const result = z.string().trim().min(1).max(63).safeParse(process.env.STORAGE_BUCKET_PRODUCTS);
  if (!result.success) {
    throw new EnvironmentConfigurationError(["STORAGE_BUCKET_PRODUCTS: is required"]);
  }
  return result.data;
}
