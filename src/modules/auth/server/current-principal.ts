import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffPrincipal } from "@/modules/auth/domain/authorization";

import { findPrincipalByIdentityId } from "./authorization-repository";

const identityIdSchema = z.string().uuid();

export async function getCurrentPrincipal(): Promise<StaffPrincipal | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error !== null || data?.claims === undefined) {
    return null;
  }

  const identityId = identityIdSchema.safeParse(data.claims.sub);

  if (!identityId.success) {
    return null;
  }

  return findPrincipalByIdentityId(identityId.data);
}
