import { google } from "googleapis";
import { getGoogleClient, type GoogleOAuthClient } from "./client";

function calendarClient(auth: GoogleOAuthClient) {
  return google.calendar({ version: "v3", auth });
}

export async function listEvents(
  userId: string,
  opts?: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  },
) {
  const auth = await getGoogleClient(userId);
  const calendar = calendarClient(auth);
  const res = await calendar.events.list({
    calendarId: opts?.calendarId ?? "primary",
    timeMin: opts?.timeMin ?? new Date().toISOString(),
    timeMax: opts?.timeMax,
    maxResults: opts?.maxResults ?? 25,
    singleEvents: true,
    orderBy: "startTime",
  });
  return res.data.items ?? [];
}

export async function createEvent(
  userId: string,
  params: {
    calendarId?: string;
    summary: string;
    description?: string;
    start: { date?: string; dateTime?: string; timeZone?: string };
    end: { date?: string; dateTime?: string; timeZone?: string };
  },
) {
  const auth = await getGoogleClient(userId);
  const calendar = calendarClient(auth);
  const res = await calendar.events.insert({
    calendarId: params.calendarId ?? "primary",
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: params.start,
      end: params.end,
    },
  });
  return res.data;
}
