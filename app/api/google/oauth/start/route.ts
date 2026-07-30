import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationUrl } from "@/lib/google/oauth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/auth/login", request.url);
    login.searchParams.set("next", "/dashboard/settings");
    return NextResponse.redirect(login);
  }

  try {
    const url = getAuthorizationUrl(user.id);
    return NextResponse.redirect(url);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start Google OAuth";
    const settings = new URL("/dashboard/settings", request.url);
    settings.searchParams.set("error", message);
    return NextResponse.redirect(settings);
  }
}
