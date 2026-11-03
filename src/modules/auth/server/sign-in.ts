"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authorizePermission } from "@/modules/auth/domain/authorization";

import { findPrincipalByIdentityId } from "./authorization-repository";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signInStaff(formData: FormData): Promise<never> {
  const credentials = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!credentials.success) {
    redirect("/admin/sign-in?error=invalid_credentials");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(credentials.data);

  if (error !== null || data.user === null) {
    redirect("/admin/sign-in?error=invalid_credentials");
  }

  const principal = await findPrincipalByIdentityId(data.user.id);
  const decision = authorizePermission(principal, "admin.access");

  if (!decision.allowed) {
    await supabase.auth.signOut();
    redirect("/admin/sign-in?error=access_denied");
  }

  redirect("/admin");
}
