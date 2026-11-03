import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey } from "@/config/operations-env";
import { getSupabasePublicEnvironment } from "@/config/supabase-env";

export function createSupabaseAdminClient() {
  const environment = getSupabasePublicEnvironment();

  return createClient(environment.url, getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
