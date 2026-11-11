import { z } from "zod";

import { EnvironmentConfigurationError } from "@/config/env";

function parseRequiredValue(
  input: Record<string, string | undefined>,
  key: "COURIER_WEBHOOK_SECRET" | "SUPABASE_SERVICE_ROLE_KEY" | "WORKER_INVOCATION_SECRET",
): string {
  const result = z.string().min(32, "must contain at least 32 characters").safeParse(input[key]);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      result.error.issues.map((issue) => `${key}: ${issue.message}`),
    );
  }

  return result.data;
}

export function getSupabaseServiceRoleKey(): string {
  return parseRequiredValue(process.env, "SUPABASE_SERVICE_ROLE_KEY");
}

export function getWorkerInvocationSecret(): string {
  return parseRequiredValue(process.env, "WORKER_INVOCATION_SECRET");
}

export function getCourierWebhookSecret(): string {
  return parseRequiredValue(process.env, "COURIER_WEBHOOK_SECRET");
}

export function parseSupabaseServiceRoleKey(input: Record<string, string | undefined>): string {
  return parseRequiredValue(input, "SUPABASE_SERVICE_ROLE_KEY");
}

export function parseWorkerInvocationSecret(input: Record<string, string | undefined>): string {
  return parseRequiredValue(input, "WORKER_INVOCATION_SECRET");
}

export function parseCourierWebhookSecret(input: Record<string, string | undefined>): string {
  return parseRequiredValue(input, "COURIER_WEBHOOK_SECRET");
}
