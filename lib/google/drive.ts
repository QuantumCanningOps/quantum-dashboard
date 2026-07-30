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
  });
  return res.data.files ?? [];
}

export async function downloadFile(
  userId: string,
  fileId: string,
): Promise<{ name: string; mimeType: string; data: Buffer }> {
  const auth = await getGoogleClient(userId);
  const drive = driveClient(auth);

  const meta = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, size",
    supportsAllDrives: true,
  });

  const name = meta.data.name ?? "drive-file";
  const sourceMime = meta.data.mimeType ?? "application/octet-stream";
  const exportAs = GOOGLE_DOC_EXPORT_MIME[sourceMime];

  if (exportAs) {
    const res = await drive.files.export(
      { fileId, mimeType: exportAs.mimeType },
      { responseType: "arraybuffer" },
    );
    const exportName = name.toLowerCase().endsWith(exportAs.extension)
      ? name
      : `${name}${exportAs.extension}`;
    return {
      name: exportName,
      mimeType: exportAs.mimeType,
      data: Buffer.from(res.data as ArrayBuffer),
    };
  }

  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );

  return {
    name,
    mimeType: sourceMime,
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
  });
  return res.data;
}
