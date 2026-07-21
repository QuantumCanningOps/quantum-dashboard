import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteGoogleConnection,
  revokeGoogleToken,
} from "@/lib/google/tokens";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await revokeGoogleToken(user.id);
    await deleteGoogleConnection(user.id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to disconnect Google";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return NextResponse.redirect(new URL("/dashboard/settings", request.url));
  }

  return NextResponse.json({ ok: true });
}
