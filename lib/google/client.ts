import { google } from "googleapis";
import { createOAuth2Client } from "./oauth";
import {
  GoogleNeedsReauthError,
  loadGoogleConnection,
  markNeedsReauth,
  persistRefreshedTokens,
} from "./tokens";
import { decryptTokens } from "./crypto";

export type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;

/**
 * Returns an authenticated Google OAuth2 client for the given dashboard user.
 * Refreshes and persists access tokens as needed.
 */
export async function getGoogleClient(
  userId: string,
): Promise<GoogleOAuthClient> {
  const row = await loadGoogleConnection(userId);
  if (!row || row.status !== "active") {
    throw new GoogleNeedsReauthError();
  }

  let payload;
  try {
    payload = decryptTokens(row.token_ciphertext);
  } catch {
    await markNeedsReauth(userId);
    throw new GoogleNeedsReauthError("Stored Google tokens are corrupt");
  }

  if (!payload.refresh_token) {
    await markNeedsReauth(userId);
    throw new GoogleNeedsReauthError("Missing Google refresh token");
  }

  const client = createOAuth2Client();
  client.setCredentials({
    refresh_token: payload.refresh_token,
    access_token: payload.access_token || undefined,
    expiry_date: payload.expiry_date ?? undefined,
  });

  client.on("tokens", (tokens) => {
    void persistRefreshedTokens(userId, tokens).catch(() => {
      // Best-effort persist; next request can refresh again.
    });
  });

  // Proactively refresh if expired or missing access token
  const expired =
    !payload.access_token ||
    (payload.expiry_date != null && payload.expiry_date <= Date.now() + 60_000);

  if (expired) {
    try {
      const { credentials } = await client.refreshAccessToken();
      await persistRefreshedTokens(userId, credentials);
      client.setCredentials(credentials);
    } catch {
      await markNeedsReauth(userId);
      throw new GoogleNeedsReauthError(
        "Google refresh failed; reconnect your account",
      );
    }
  }

  return client;
}
