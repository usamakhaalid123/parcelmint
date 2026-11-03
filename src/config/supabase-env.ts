import { z } from "zod";

import { EnvironmentConfigurationError } from "@/config/env";

const supabasePublicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "is required"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
});

export type SupabasePublicEnvironment = {
  anonKey: string;
  url: string;
};

export function parseSupabasePublicEnvironment(
  input: Record<string, string | undefined>,
): SupabasePublicEnvironment {
  const result = supabasePublicEnvironmentSchema.safeParse(input);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  return {
    anonKey: result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    url: result.data.NEXT_PUBLIC_SUPABASE_URL,
  };
}

export function getSupabasePublicEnvironment(): SupabasePublicEnvironment {
  return parseSupabasePublicEnvironment(process.env);
}
