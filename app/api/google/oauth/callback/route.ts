import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import {
  createOAuth2Client,
  exchangeCode,
  verifySignedState,
} from "@/lib/google/oauth";
import { saveGoogleConnection } from "@/lib/google/tokens";
import { GOOGLE_SCOPES } from "@/lib/google/scopes";

function redirectWithError(request: Request, message: string) {
  const settings = new URL("/dashboard/settings", request.url);
  settings.searchParams.set("error", message);
  return NextResponse.redirect(settings);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return redirectWithError(request, `Google OAuth error: ${oauthError}`);
  }
  if (!code || !state) {
    return redirectWithError(request, "Missing OAuth code or state");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/auth/login", request.url);
    login.searchParams.set("next", "/dashboard/settings");
    return NextResponse.redirect(login);
  }

  let statePayload;
  try {
    statePayload = verifySignedState(state);
  } catch {
    return redirectWithError(request, "Invalid or expired OAuth state");
  }

  if (statePayload.userId !== user.id) {
    return redirectWithError(request, "OAuth state does not match signed-in user");
  }

  try {
    const tokens = await exchangeCode(code);
    const client = createOAuth2Client();
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.id || !profile.email) {
      return redirectWithError(request, "Google profile missing id or email");
    }

    const grantedScopes = (tokens.scope ?? GOOGLE_SCOPES.join(" "))
      .split(/[\s,]+/)
      .filter(Boolean);

    await saveGoogleConnection({
      userId: user.id,
      googleEmail: profile.email,
      googleSub: profile.id,
      scopes: grantedScopes,
      tokens,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to complete Google OAuth";
    return redirectWithError(request, message);
  }

  const settings = new URL("/dashboard/settings", request.url);
  settings.searchParams.set("connected", "1");
  return NextResponse.redirect(settings);
}
