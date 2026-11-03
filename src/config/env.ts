import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    DEPLOYMENT_ENV: z.enum(["local", "staging", "production"]).default("local"),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((environment, context) => {
    if (environment.DEPLOYMENT_ENV !== "local" && environment.NEXT_PUBLIC_APP_URL === undefined) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_APP_URL"],
        message: "is required outside local development",
      });
    }

    if (
      environment.DEPLOYMENT_ENV !== "local" &&
      environment.NEXT_PUBLIC_APP_URL !== undefined &&
      !environment.NEXT_PUBLIC_APP_URL.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_APP_URL"],
        message: "must use HTTPS outside local development",
      });
    }
  });

export class EnvironmentConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment configuration: ${issues.join("; ")}`);
    this.name = "EnvironmentConfigurationError";
    this.issues = issues;
  }
}

export type ServerEnvironment = {
  appUrl: string;
  deployment: "local" | "staging" | "production";
  logLevel: "debug" | "info" | "warn" | "error";
};

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join(".") || "environment";
      return `${path}: ${issue.message}`;
    });

    throw new EnvironmentConfigurationError(issues);
  }

  return {
    appUrl: result.data.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    deployment: result.data.DEPLOYMENT_ENV,
    logLevel: result.data.LOG_LEVEL,
  };
}

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}
