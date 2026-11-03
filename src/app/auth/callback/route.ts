import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSafeRedirectPath } from "@/modules/auth/domain/safe-redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = resolveSafeRedirectPath(url.searchParams.get("next"));

  if (code === null) {
    return NextResponse.redirect(new URL("/admin/sign-in?error=invalid_callback", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    return NextResponse.redirect(new URL("/admin/sign-in?error=invalid_callback", url.origin));
  }

  return NextResponse.redirect(new URL(nextPath, url.origin));
}
