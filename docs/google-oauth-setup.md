# Google Account Integration Setup

Connect Google is a **separate** OAuth flow from Supabase login. Users stay signed in with email/password, then link Gmail, Drive, and Calendar from Settings.

## 1. Google Cloud Console

1. Create or select a Google Cloud project.
2. Enable APIs:
   - Gmail API
   - Google Drive API
   - Google Calendar API
   - Google Picker API (required for “Google Drive” file pickers on formula uploads)
3. Configure the **OAuth consent screen**
   - Use **Internal** if everyone is on your Google Workspace.
   - Use **External** otherwise (Testing mode limits who can connect; refresh tokens expire ~7 days until the app is verified).
4. Create **OAuth 2.0 Client ID** → Application type **Web application**.
5. Add authorized redirect URI:
   - Local: `http://localhost:3000/api/google/oauth/callback`
   - Production: `https://<your-domain>/api/google/oauth/callback`

## 2. Scopes requested

- `openid` `email` `profile`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/calendar`

These are sensitive/restricted scopes. Production use outside a small test user list requires Google OAuth verification.

## 3. Environment variables

Add to `.env.local` (never prefix secrets with `NEXT_PUBLIC_`):

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/oauth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_API_KEY=
GOOGLE_APP_ID=
SUPABASE_SERVICE_ROLE_KEY=
```

Generate a 32-byte encryption key (base64):

```bash
openssl rand -base64 32
```

`GOOGLE_API_KEY` is a Google Cloud **API key** with the Picker API enabled (used by the Drive file picker on New Formula / formula documents). Restrict it by HTTP referrer in production.

`GOOGLE_APP_ID` is optional — the Cloud project *number* (not the OAuth client id). Set it if Picker requires `setAppId`.

`SUPABASE_SERVICE_ROLE_KEY` comes from Supabase project settings → API. Locally, run `supabase status -o env` in `quantum-ops` and copy `SERVICE_ROLE_KEY`. Used only on the server to read/write encrypted Google tokens.

## 4. Database

Apply the `google_connections` migration in `quantum-ops`:

```bash
cd ../quantum-ops && supabase db reset   # local
# or: supabase db push                   # linked remote
```

## 5. Verify

1. Sign in to the dashboard.
2. Open **Settings** → **Connect Google**.
3. Complete consent; you should see your Google email and `active` status.
4. **Disconnect** clears the connection and revokes the token at Google when possible.
