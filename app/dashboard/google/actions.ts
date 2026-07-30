"use server";

import { createClient } from "@/lib/supabase/server";
import { downloadFile } from "@/lib/google/drive";
import { getGoogleClient } from "@/lib/google/client";
import {
  GoogleNeedsReauthError,
  loadGoogleConnection,
} from "@/lib/google/tokens";

export type DrivePickerSession =
  | {
      ok: true;
      accessToken: string;
      clientId: string;
      developerKey: string;
      appId: string | null;
    }
  | {
      ok: false;
      reason: "not_authenticated" | "not_connected" | "needs_reauth" | "misconfigured";
      message: string;
    };

export type DriveFileImportResult =
  | {
      ok: true;
      fileName: string;
      mimeType: string;
      base64: string;
    }
  | {
      ok: false;
      reason: "not_authenticated" | "not_connected" | "needs_reauth" | "api_error";
      message: string;
    };

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Short-lived OAuth access token + Picker config for the Google Picker UI. */
export async function getGoogleDrivePickerSession(): Promise<DrivePickerSession> {
  const userId = await requireUserId();
  if (!userId) {
    return {
      ok: false,
      reason: "not_authenticated",
      message: "Not authenticated.",
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const developerKey =
    process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_PICKER_API_KEY ?? "";
  if (!clientId || !developerKey) {
    return {
      ok: false,
      reason: "misconfigured",
      message:
        "Google Drive picker is not configured. Add GOOGLE_API_KEY (Picker API key) to the server environment.",
    };
  }

  const connection = await loadGoogleConnection(userId);
  if (!connection) {
    return {
      ok: false,
      reason: "not_connected",
      message: "Connect Google in Settings to pick files from Drive.",
    };
  }
  if (connection.status !== "active") {
    return {
      ok: false,
      reason: "needs_reauth",
      message: "Reconnect Google in Settings to pick files from Drive.",
    };
  }

  try {
    const auth = await getGoogleClient(userId);
    const accessToken = auth.credentials.access_token;
    if (!accessToken) {
      return {
        ok: false,
        reason: "needs_reauth",
        message: "Google access token missing — reconnect in Settings.",
      };
    }

    return {
      ok: true,
      accessToken,
      clientId,
      developerKey,
      appId: process.env.GOOGLE_APP_ID ?? null,
    };
  } catch (e) {
    if (e instanceof GoogleNeedsReauthError) {
      return { ok: false, reason: "needs_reauth", message: e.message };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "needs_reauth", message: msg };
  }
}

/** Download a Drive file the user selected in Picker (grants drive.file access). */
export async function importGoogleDriveFile(
  fileId: string,
): Promise<DriveFileImportResult> {
  const userId = await requireUserId();
  if (!userId) {
    return {
      ok: false,
      reason: "not_authenticated",
      message: "Not authenticated.",
    };
  }
  if (!fileId.trim()) {
    return { ok: false, reason: "api_error", message: "No Drive file selected." };
  }

  try {
    const file = await downloadFile(userId, fileId.trim());
    return {
      ok: true,
      fileName: file.name,
      mimeType: file.mimeType,
      base64: file.data.toString("base64"),
    };
  } catch (e) {
    if (e instanceof GoogleNeedsReauthError) {
      return { ok: false, reason: "needs_reauth", message: e.message };
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[importGoogleDriveFile]", msg);
    return { ok: false, reason: "api_error", message: `Drive download failed: ${msg}` };
  }
}
