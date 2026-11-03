import { z } from "zod";

import { EnvironmentConfigurationError } from "@/config/env";

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1, "is required"),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
});

export type DatabaseEnvironment = {
  directUrl: string;
  pooledUrl: string;
};

export function parseDatabaseEnvironment(
  input: Record<string, string | undefined>,
): DatabaseEnvironment {
  const result = databaseEnvironmentSchema.safeParse(input);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  return {
    directUrl: result.data.DIRECT_DATABASE_URL ?? result.data.DATABASE_URL,
    pooledUrl: result.data.DATABASE_URL,
  };
}

export function getDatabaseEnvironment(): DatabaseEnvironment {
  return parseDatabaseEnvironment(process.env);
}
