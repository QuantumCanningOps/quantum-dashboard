export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  // drive.file alone can open Picker but often cannot download existing/
  // shared files afterward. drive.readonly is required to import picks.
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar",
] as const;

export type GoogleScope = (typeof GOOGLE_SCOPES)[number];
