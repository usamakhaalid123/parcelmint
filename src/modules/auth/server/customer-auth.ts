"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { customerProfiles, users } from "@/db/schema";
import { getServerEnvironment } from "@/config/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";

const customerCredentials = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

async function provisionCustomer(input: {
  displayName: string;
  email: string;
  identityId: string;
  mobileNumber: string | null;
}) {
  const database = getDatabase();
  await database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ accountType: users.accountType, id: users.id })
      .from(users)
      .where(eq(users.identityId, input.identityId))
      .limit(1);
    if (existing?.accountType === "staff") throw new Error("customer_access_denied");
    const userId = existing?.id;
    const [customer] =
      userId === undefined
        ? await transaction
            .insert(users)
            .values({ accountType: "customer", identityId: input.identityId })
            .returning({ id: users.id })
        : [{ id: userId }];
    if (customer === undefined) throw new Error("customer_provision_failed");
    await transaction
      .insert(customerProfiles)
      .values({
        displayName: input.displayName,
        email: input.email.toLowerCase(),
        mobileNumber: input.mobileNumber,
        userId: customer.id,
      })
      .onConflictDoUpdate({
        target: customerProfiles.userId,
        set: {
          displayName: input.displayName,
          email: input.email.toLowerCase(),
          mobileNumber: input.mobileNumber,
          updatedAt: new Date(),
        },
      });
  });
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signUpCustomer(formData: FormData): Promise<never> {
  const parsed = customerCredentials
    .extend({
      displayName: z.string().trim().min(2).max(120),
      mobileNumber: z.string().trim().min(7).max(30),
    })
    .safeParse({
      displayName: formValue(formData, "displayName"),
      email: formValue(formData, "email"),
      mobileNumber: formValue(formData, "mobileNumber"),
      password: formValue(formData, "password"),
    });
  if (!parsed.success) redirect("/account/sign-in?error=invalid_details");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName, mobile_number: parsed.data.mobileNumber },
      emailRedirectTo: `${getServerEnvironment().appUrl}/auth/callback?next=/account`,
    },
  });
  if (error !== null || data.user === null) redirect("/account/sign-in?error=signup_failed");
  await provisionCustomer({
    displayName: parsed.data.displayName,
    email: parsed.data.email,
    identityId: data.user.id,
    mobileNumber: parsed.data.mobileNumber,
  });
  redirect(data.session === null ? "/account/sign-in?notice=confirm_email" : "/account");
}

export async function signInCustomer(formData: FormData): Promise<never> {
  const parsed = customerCredentials.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
  });
  if (!parsed.success) redirect("/account/sign-in?error=invalid_credentials");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error !== null || data.user === null) redirect("/account/sign-in?error=invalid_credentials");
  const metadata = data.user.user_metadata;
  await provisionCustomer({
    displayName:
      typeof metadata.display_name === "string" ? metadata.display_name : parsed.data.email,
    email: parsed.data.email,
    identityId: data.user.id,
    mobileNumber: typeof metadata.mobile_number === "string" ? metadata.mobile_number : null,
  });
  redirect("/account");
}

export async function signOutCustomer(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/account/sign-in");
}
