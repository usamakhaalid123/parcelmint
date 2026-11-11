import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSafeRedirectPath } from "@/modules/auth/domain/safe-redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = resolveSafeRedirectPath(url.searchParams.get("next"));
  const errorPath = nextPath.startsWith("/account")
    ? "/account/sign-in?error=invalid_callback"
    : "/admin/sign-in?error=invalid_callback";

  if (code === null) {
    return NextResponse.redirect(new URL(errorPath, url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    return NextResponse.redirect(new URL(errorPath, url.origin));
  }

  return NextResponse.redirect(new URL(nextPath, url.origin));
}
