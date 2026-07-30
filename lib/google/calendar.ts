import { google } from "googleapis";
import { getGoogleClient, type GoogleOAuthClient } from "./client";

function calendarClient(auth: GoogleOAuthClient) {
  return google.calendar({ version: "v3", auth });
}

export type GoogleAllDayBounds = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

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
    start: GoogleAllDayBounds;
    end: GoogleAllDayBounds;
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

export async function updateEvent(
  userId: string,
  params: {
    calendarId?: string;
    eventId: string;
    summary: string;
    description?: string;
    start: GoogleAllDayBounds;
    end: GoogleAllDayBounds;
  },
) {
  const auth = await getGoogleClient(userId);
  const calendar = calendarClient(auth);
  const res = await calendar.events.update({
    calendarId: params.calendarId ?? "primary",
    eventId: params.eventId,
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: params.start,
      end: params.end,
    },
  });
  return res.data;
}

export async function deleteEvent(
  userId: string,
  params: { calendarId?: string; eventId: string },
) {
  const auth = await getGoogleClient(userId);
  const calendar = calendarClient(auth);
  await calendar.events.delete({
    calendarId: params.calendarId ?? "primary",
    eventId: params.eventId,
  });
}

/** Next calendar day as YYYY-MM-DD (Google all-day end is exclusive). */
export function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
