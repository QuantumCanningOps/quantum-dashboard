import { Readable } from "stream";
import { google } from "googleapis";
import { getGoogleClient, type GoogleOAuthClient } from "./client";

function driveClient(auth: GoogleOAuthClient) {
  return google.drive({ version: "v3", auth });
}

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
