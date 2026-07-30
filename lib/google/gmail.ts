import { google } from "googleapis";
import { getGoogleClient, type GoogleOAuthClient } from "./client";

function gmailClient(auth: GoogleOAuthClient) {
  return google.gmail({ version: "v1", auth });
}

export async function listMessages(
  userId: string,
  opts?: { maxResults?: number; q?: string },
) {
  const auth = await getGoogleClient(userId);
  const gmail = gmailClient(auth);
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: opts?.maxResults ?? 10,
    q: opts?.q,
  });
  return res.data.messages ?? [];
}

export async function sendMessage(
  userId: string,
  params: { to: string; subject: string; body: string },
) {
  const auth = await getGoogleClient(userId);
  const gmail = gmailClient(auth);

  const raw = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    params.body,
  ].join("\r\n");

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
  return res.data;
}
