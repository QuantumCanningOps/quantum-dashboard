import { Readable } from "stream";
import { google } from "googleapis";
import { getGoogleClient, type GoogleOAuthClient } from "./client";

function driveClient(auth: GoogleOAuthClient) {
  return google.drive({ version: "v3", auth });
}

const GOOGLE_DOC_EXPORT_MIME: Record<string, { mimeType: string; extension: string }> = {
  "application/vnd.google-apps.document": {
    mimeType: "application/pdf",
    extension: ".pdf",
  },
  "application/vnd.google-apps.spreadsheet": {
    mimeType: "application/pdf",
    extension: ".pdf",
  },
  "application/vnd.google-apps.presentation": {
    mimeType: "application/pdf",
    extension: ".pdf",
  },
};

export async function listFiles(
  userId: string,
  opts?: { pageSize?: number; q?: string },
) {
  const auth = await getGoogleClient(userId);
  const drive = driveClient(auth);
  const res = await drive.files.list({
    pageSize: opts?.pageSize ?? 20,
    q: opts?.q,
    fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files ?? [];
}

async function resolveDriveFileId(
  drive: ReturnType<typeof driveClient>,
  fileId: string,
): Promise<{ id: string; name: string; mimeType: string }> {
  const meta = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, shortcutDetails(targetId, targetMimeType)",
    supportsAllDrives: true,
  });

  const mimeType = meta.data.mimeType ?? "application/octet-stream";
  if (
    mimeType === "application/vnd.google-apps.shortcut" &&
    meta.data.shortcutDetails?.targetId
  ) {
    const target = await drive.files.get({
      fileId: meta.data.shortcutDetails.targetId,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });
    return {
      id: target.data.id ?? meta.data.shortcutDetails.targetId,
      name: target.data.name ?? meta.data.name ?? "drive-file",
      mimeType:
        target.data.mimeType ??
        meta.data.shortcutDetails.targetMimeType ??
        "application/octet-stream",
    };
  }

  return {
    id: meta.data.id ?? fileId,
    name: meta.data.name ?? "drive-file",
    mimeType,
  };
}

export async function downloadFile(
  userId: string,
  fileId: string,
): Promise<{ name: string; mimeType: string; data: Buffer }> {
  const auth = await getGoogleClient(userId);
  const drive = driveClient(auth);

  let resolved: { id: string; name: string; mimeType: string };
  try {
    resolved = await resolveDriveFileId(drive, fileId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${msg} If this file is in shared Drive, disconnect and reconnect Google in Settings so drive.readonly is granted.`,
    );
  }

  const exportAs = GOOGLE_DOC_EXPORT_MIME[resolved.mimeType];

  if (exportAs) {
    const res = await drive.files.export(
      { fileId: resolved.id, mimeType: exportAs.mimeType },
      { responseType: "arraybuffer" },
    );
    const exportName = resolved.name.toLowerCase().endsWith(exportAs.extension)
      ? resolved.name
      : `${resolved.name}${exportAs.extension}`;
    return {
      name: exportName,
      mimeType: exportAs.mimeType,
      data: Buffer.from(res.data as ArrayBuffer),
    };
  }

  const res = await drive.files.get(
    { fileId: resolved.id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );

  return {
    name: resolved.name,
    mimeType: resolved.mimeType,
    data: Buffer.from(res.data as ArrayBuffer),
  };
}

export async function uploadFile(
  userId: string,
  params: {
    name: string;
    mimeType: string;
    content: Buffer | string;
    parents?: string[];
  },
) {
  const auth = await getGoogleClient(userId);
  const drive = driveClient(auth);
  const body =
    typeof params.content === "string"
      ? Buffer.from(params.content)
      : params.content;

  const res = await drive.files.create({
    requestBody: {
      name: params.name,
      parents: params.parents,
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(body),
    },
    fields: "id, name, mimeType, webViewLink",
    supportsAllDrives: true,
  });
  return res.data;
}
