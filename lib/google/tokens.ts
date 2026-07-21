import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptTokens,
  encryptTokens,
  type GoogleTokenPayload,
} from "./crypto";
import { createOAuth2Client } from "./oauth";

/** Subset of google-auth Credentials used for persistence. */
export type GoogleCredentials = {
  refresh_token?: string | null;
  access_token?: string | null;
  expiry_date?: number | null;
  scope?: string;
};

export type GoogleConnectionStatus = "active" | "revoked" | "needs_reauth";

export type GoogleConnectionRow = {
  user_id: string;
  google_email: string;
  google_sub: string;
  scopes: string[];
  token_ciphertext: string;
  status: GoogleConnectionStatus;
  connected_at: string;
  updated_at: string;
};

export class GoogleNeedsReauthError extends Error {
  constructor(message = "Google account needs reauthorization") {
    super(message);
    this.name = "GoogleNeedsReauthError";
  }
}

export async function saveGoogleConnection(params: {
  userId: string;
  googleEmail: string;
  googleSub: string;
  scopes: string[];
  tokens: GoogleCredentials;
}): Promise<void> {
  const { userId, googleEmail, googleSub, scopes, tokens } = params;

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. Disconnect and reconnect with consent.",
    );
  }

  const admin = createAdminClient();
  const existing = await admin
    .from("google_connections")
    .select("token_ciphertext")
    .eq("user_id", userId)
    .maybeSingle();

  let previous: GoogleTokenPayload | null = null;
  if (existing.data?.token_ciphertext) {
    try {
      previous = decryptTokens(existing.data.token_ciphertext);
    } catch {
      previous = null;
    }
  }

  const payload: GoogleTokenPayload = {
    refresh_token: tokens.refresh_token ?? previous?.refresh_token ?? "",
    access_token: tokens.access_token ?? previous?.access_token ?? "",
    expiry_date: tokens.expiry_date ?? previous?.expiry_date ?? null,
  };

  if (!payload.refresh_token) {
    throw new Error("Missing Google refresh_token");
  }

  const { error } = await admin.from("google_connections").upsert(
    {
      user_id: userId,
      google_email: googleEmail,
      google_sub: googleSub,
      scopes,
      token_ciphertext: encryptTokens(payload),
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to save Google connection: ${error.message}`);
  }
}

export async function loadGoogleConnection(
  userId: string,
): Promise<GoogleConnectionRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Google connection: ${error.message}`);
  }
  return data as GoogleConnectionRow | null;
}

export async function markNeedsReauth(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("google_connections")
    .update({
      status: "needs_reauth",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function deleteGoogleConnection(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("google_connections")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to delete Google connection: ${error.message}`);
  }
}

/** Persist refreshed access tokens after googleapis refresh. */
export async function persistRefreshedTokens(
  userId: string,
  tokens: GoogleCredentials,
): Promise<void> {
  const row = await loadGoogleConnection(userId);
  if (!row) return;

  const previous = decryptTokens(row.token_ciphertext);
  const payload: GoogleTokenPayload = {
    refresh_token: tokens.refresh_token ?? previous.refresh_token,
    access_token: tokens.access_token ?? previous.access_token,
    expiry_date: tokens.expiry_date ?? previous.expiry_date,
  };

  const admin = createAdminClient();
  await admin
    .from("google_connections")
    .update({
      token_ciphertext: encryptTokens(payload),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function revokeGoogleToken(userId: string): Promise<void> {
  const row = await loadGoogleConnection(userId);
  if (!row) return;

  const payload = decryptTokens(row.token_ciphertext);
  const client = createOAuth2Client();
  const tokenToRevoke = payload.refresh_token || payload.access_token;
  if (tokenToRevoke) {
    try {
      await client.revokeToken(tokenToRevoke);
    } catch {
      // Token may already be revoked; still clear local state.
    }
  }
}
