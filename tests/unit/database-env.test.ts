import { describe, expect, it } from "vitest";

import { parseDatabaseEnvironment } from "@/config/database-env";
import { EnvironmentConfigurationError } from "@/config/env";
import { parseSupabasePublicEnvironment } from "@/config/supabase-env";

describe("phase 1 environment configuration", () => {
  it("requires a database URL only when the database boundary is used", () => {
    expect(() => parseDatabaseEnvironment({})).toThrow(EnvironmentConfigurationError);
  });

  it("uses the pooled URL as the migration fallback", () => {
    expect(parseDatabaseEnvironment({ DATABASE_URL: "postgresql://localhost/store" })).toEqual({
      directUrl: "postgresql://localhost/store",
      pooledUrl: "postgresql://localhost/store",
    });
  });

  it("keeps the direct migration connection separate", () => {
    expect(
      parseDatabaseEnvironment({
        DATABASE_URL: "postgresql://pooler/store",
        DIRECT_DATABASE_URL: "postgresql://database/store",
      }),
    ).toEqual({
      directUrl: "postgresql://database/store",
      pooledUrl: "postgresql://pooler/store",
    });
  });

  it("validates public Supabase configuration without exposing secret values", () => {
    expect(
      parseSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      }),
    ).toEqual({
      anonKey: "public-anon-key",
      url: "https://project.supabase.co",
    });

    expect(() => parseSupabasePublicEnvironment({})).toThrow(EnvironmentConfigurationError);
  });
});
