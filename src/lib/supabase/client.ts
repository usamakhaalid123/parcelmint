"use client";

import { createBrowserClient } from "@supabase/ssr";

import { parseSupabasePublicEnvironment } from "@/config/supabase-env";

export function createSupabaseBrowserClient() {
  const environment = parseSupabasePublicEnvironment({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  return createBrowserClient(environment.url, environment.anonKey);
}
